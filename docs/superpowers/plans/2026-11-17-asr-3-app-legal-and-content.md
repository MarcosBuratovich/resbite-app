# App legal links, licences and content clean-up Implementation Plan (App Store readiness plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The iPhone app does what the public documents promise without any backend change. It has the legal links, About and legal, the company details, a Licences screen, an accurate Data & privacy page and "Request a copy of my data". It loses its sample, beta and test wording, the unused location and storage libraries, the email read from Contacts and the dead sign-up code. It uses Apple's own sign-in button and ships as version 1.0.0 with a privacy manifest that matches the App Privacy answers. A production build that lacks the support address, or has push or account deletion off, stops at a release check.

**Architecture:** The plan is app-only (`mobile/`), with no migration and no Edge Function. One domain module, `src/domain/legal.ts`, holds the canonical link.resbite.com URLs (the Terms and Privacy URLs can be overridden by `EXPO_PUBLIC_*`), the company particulars from AS-D1 and the legal copy. Every legal link in the app opens through one helper. The release check is a pure function, `releaseProblems(env)`, run by a script that EAS calls as its `eas-build-post-install` hook for the production profile. The licence notices are generated from `package-lock.json` and `node_modules` into a committed JSON file, which a drift test keeps current. Data & privacy draws its topics from a copy module that a test checks against `docs/legal/privacy-notice.md`. The privacy manifest is tested against the SDK manifests in `node_modules` and the App Privacy table in the App Store Connect pack.

**Tech Stack:** Expo SDK 57.0.23 (`mobile/package.json:20`), expo-router 57.0.21, React Native 0.86.3, TypeScript 6.0.3. The tests are `node:test` files run with tsx (`npm test`; the repo has no jest). Browser checks use Playwright 1.63.0 in headless Chrome against Expo web. `expo-apple-authentication` ~57.0.2.

**Spec:** `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`. Read sections 2, 4 (B1, B4, B5, B8, B9, B10, B11 dead code only, B13, B14, A25), 5 and 6. The rows are PRV-1, PRV-4, PRV-8, PRV-16, PRV-21, PERM-1 to PERM-3, PERM-6, CON-1, CON-2, CON-8, CON-11, SI-4, SI-5, SI-8, UGC-4, DOC-3 and OPS-2. Also read `knowledge-base/08-decisions.md`, section "App Store readiness (AS), 17 November 2026". AS-D1 to AS-D8 and AS-R1 to AS-R9 override the spec where they differ. The public documents are in `docs/legal/` (`privacy-notice.md` is titled "Privacy Policy", AS-R5). The App Privacy answers are section 6 of `qa/app-store-release/app-store-connect-pack.md`, and the release runbook is `qa/app-store-release/README.md`.

**Branch:** `asr-3-app-legal`, cut from `app-store-readiness` at the commit that adds this plan, and merged back into `app-store-readiness` in the roadmap's order (`docs/superpowers/plans/2026-11-17-asr-0-roadmap.md`). Commit and push to it freely. Merging to `main` is the owner's choice.

**Tasks:** 11, then "Rollout (owner-run)".

## Sequencing with the other readiness plans

- **Plan 2 owns** account deletion (B3), the suspended screen and the taken-number line (B6), and C2. Its files are `mobile/app/delete-account.tsx`, the suspended branch of `mobile/app/account.tsx`, `mobile/src/services/accountDeletion.ts` and `accountDeletionFlow.ts`, and `PHONE_COPY.taken`. This plan does not touch them.
  - Task 7's wording scan lists plan 2's three files as the only exceptions. Plan 2 removes them from the list as it rewrites them.
  - Both plans change `mobile/scripts/verify-deletion.mjs`: this plan its Data & privacy part (`:37-38`, `:232-282`), plan 2 its deletion part. `mobile/app/delete-account.tsx` keeps `AppleMark` (Task 9 leaves `src/design/AppleMark.tsx` in place for it).
- **Plan 4 (`docs/superpowers/plans/2026-11-17-asr-4-terms-safety-details.md`) owns** B2, B7 and B11's Account details half. Its files are `GUEST_COPY`, `TERMS_VERSION`, `mobile/app/invite.tsx`, `mobile/app/accept-terms.tsx`, `mobile/app/account-details.tsx`, `src/design/RegistrationDetails.tsx`, `src/domain/registration.ts` and `SAFETY_COPY`.
  - This plan does not change the tick's wording. `links/personal-flow.test.mjs:162` pins the link site's copy equal to `GUEST_COPY.terms`.
  - **One `termsRuns`.** Plan 4's Task 5 also plans a `termsRuns` (in `termsCopy.ts`) and a `TermsLine` that splits with it. Its shared-files rule says: "keep B1's URL source and apply only this plan's phrase matching".
    - This plan's `termsRuns` (Task 1, in `legal.ts`) does both. Its tests include plan 4's line, "Read the Terms of Use. Our Privacy Policy explains how we use your data.", word for word.
    - Whichever plan lands second keeps this one and deletes the other: plan 4's `TermsLine` imports `termsRuns` from `legal.ts`.
  - **The dead sign-up code is this plan's** (Task 8, which removes the whole register branch of `useAuthFlow.ts` and `auth/index.tsx`, and with it every import from `registration.ts`). Plan 4's Task 7 no longer edits those two files: it starts only after this plan's Task 8 has merged, then deletes `registration.ts`, `RegistrationDetails.tsx`, `account-details.tsx` and their other users (cross-plan review, 17 November 2026).
  - **The chat rules link.** Plan 4's Task 6 adds "Read the full community rules" to the chat rules sheet with this plan's `ExternalLink` and `LEGAL_URLS.communityRules` (Task 1); `docs/legal/community-rules-short.md` section 5 needs it.
  - Plan 4 also changes `mobile/app/_layout.tsx`, `review-ui.mjs`, `verify-phone.mjs` and `verify-auth.mjs`. Those are different lines, and the second plan to land merges them.
  - Plan 4's shared-files note expects B5 to change `safetyCopy.ts:85-91`. This plan leaves `reportsPrivacy` and `blocksPrivacy` as they are and only shows them (open point 1).
- **Plan 1 (`…-asr-1-phone-codes.md`) changes** `useAuthFlow.ts` (the CAPTCHA token), `phoneFold.test.ts` (other lines than `:52`), `verify-phone.mjs` and `verify-contact-invites.mjs`. It also adds `react-native-webview` (B16).
  - After that package lands, Task 4's drift test and Task 10's required-reason test fail until plan 1 (or whoever lands second) runs `node --import tsx scripts/generate-licences.mjs` and adds any reasons the new SDK's `PrivacyInfo.xcprivacy` declares to `ios.privacyManifests`.
  - That failure is intended (Review Focus 3).
- **Plan 5 (the link site, D1)** publishes `/privacy`, `/terms` (with the `#community-rules` anchor) and `/support`. This plan only links to them. They must be live before the build is submitted (Rollout R2).

## Global Constraints

- **Owner-run steps.** Every EAS, TestFlight, App Store Connect, Vercel or hosted Supabase step is owner-run and needs the owner's explicit approval at the time. This plan has none until "Rollout (owner-run)".
- **No database work.** This plan has no migration and no hosted Supabase step. Never run `supabase db push`, `supabase migration repair --status reverted` or `supabase db pull`.
- **No secrets or personal data in the repo.** No secrets, real phone numbers, emails of real people or account ids. Fixtures use `example.invalid` or `x.example` addresses and the QA uuids already in the scripts (`11111111-1111-4111-8111-111111111111`). Never create `mobile/.env.local`. No service-role key in the app.
- **Public role addresses.** support@resbite.com and privacy@resbite.com are public (AS-D3).
  - The app shows the support address only from `EXPO_PUBLIC_SUPPORT_ADDRESS`, as chat plan 3 built it (`mobile/app/data-privacy.tsx:28`).
  - privacy@resbite.com is a constant (`PRIVACY_ADDRESS`, Task 1).
- **Company particulars** come from AS-D1, exactly: Resbite Ltd, a private limited company registered in England and Wales, company number 12450334, registered office 86-90 Paul Street, London EC2A 4NE, United Kingdom. Show no VAT number: it is an owner placeholder in `docs/legal/support.md`.
- **Document names.** "Privacy Policy", "Terms of Use", "Support" and "Delete your account" (AS-R5), plus "Community rules" and "Licences". Never "Privacy Notice".
- **Copy style.** Plain British English in short sentences. The apostrophe is ’ (U+2019), as everywhere in the app's copy (`mobile/src/domain/safetyCopy.ts:5`).
- **Legal URLs** (D-10, AS-D8): `https://link.resbite.com/privacy`, `/terms`, `/terms#community-rules` and `/support`. Only `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` override them, and an override is used only if it is an https link.
- **Dot notation for build variables.** Read `EXPO_PUBLIC_*` only as `process.env.EXPO_PUBLIC_NAME`, the one form inlined when the bundle is built (`mobile/src/domain/supportContact.test.ts:51-73`).
- **Links open outside the app** through `Linking.openURL` (Safari, or Mail for `mailto:`). Never use an in-app browser: the App Store Connect pack answers "Unrestricted Web Access: No".
- **What the copy describes.** The new copy describes Resbite at 1.0, as the documents do. The build is not submitted before plan 2's deletion release and D1's pages are live. The release runbook gates this (`qa/app-store-release/README.md`, steps 13, 16 and 20).
- **Checks.** Run `cd mobile && npm run check` (typecheck, `npm test`, content validation) after every task.
  - Browser checks run against Expo web (see "How to run the browser checks").
  - On this Linux box the typecheck needs `mobile/expo-env.d.ts`. `npm run typecheck` creates it with `scripts/ensure-expo-env.mjs`.
  - After a new route is added (Tasks 4 and 5), start Expo once (`npx expo start --web`) so that `.expo/types/router.d.ts` knows `/licences` and `/about-legal`.
- **Expo docs read for this plan (SDK 57).**
  - The Apple privacy guide (`ios.privacyManifests` under `expo.ios`). Apple does not reliably read the `PrivacyInfo` files of static CocoaPods, so the app lists its dependencies' required reasons itself.
  - The EAS npm hooks reference: `eas-build-post-install` runs after `npm install`, prebuild and `pod install`.
  - EAS environment variables: `EAS_BUILD_PROFILE` is set in every build step.
  - The `AppleAuthenticationButton` API as installed: `node_modules/expo-apple-authentication/build/AppleAuthenticationButton.d.ts`. It needs a height and width in `style`, `buttonStyle` and `cornerRadius` in place of `backgroundColor` and `borderRadius`, and it renders nothing where Apple sign-in is unavailable.
- **Out of bounds.** Do not touch `mobile/app/delete-account.tsx`, the suspended screen in `mobile/app/account.tsx`, `mobile/app/account-details.tsx`, `src/design/RegistrationDetails.tsx`, `src/domain/registration.ts`, `GUEST_COPY`, `TERMS_VERSION`, `SAFETY_COPY` or anything under `links/` or `supabase/`.
- **Commits.** Commit messages start "App Store readiness:" and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions this plan makes

1. **About and legal is a screen opened from Data & privacy.** This is the path the published documents give: "Profile → Data & privacy → About and legal" (`docs/legal/privacy-notice.md`, intro; `docs/legal/support.md`, "In the app"; the review notes). Profile gets no new row.
   - The route sits outside the protected stack, beside `delete-account`, so it also opens in preview and for an account that is still waiting.
   - The welcome, phone sign-in and email sign-in screens get three links: Privacy Policy, Terms of Use and Support.
   - Phone sign-up gets no extra links. Its tick line already links the Terms and the Privacy Policy, and two links with one name on one screen confuse VoiceOver.
2. **Canonical URLs with two overrides.** The app always has working links. An override that is not https is ignored in the app, and Task 2's release check stops a production build that sets one.
3. **The support address stays build-driven** (G-N10): it is missing until the owner creates the inbox (F1). The release check makes it required for production. privacy@resbite.com is a constant, because the documents already publish it (AS-D3, AS-R7).
4. **The Wellness tab is removed, not hidden.** The route file goes, so no sample data, URL or dormant screen ships. Guideline 2.5.19, "No hidden, dormant or undocumented features" (CON-3), and guideline 2.1(a) (CON-1) make a `hidden` tab riskier than none. It comes back from git with real data (decision D-7: "Bring it back only with real data").
5. **Licences come from the npm production tree** (lockfile entries that are not `dev`, `devOptional` or `optional`), plus the two OFL fonts and the native libraries React Native builds in (from its `third-party-podspecs`). Identical texts are stored once. The list is a superset of what is bundled: crediting more is safe, and crediting less is not.
6. **The release check runs as EAS's `eas-build-post-install` hook,** for the `production` profile only, and as `npm run check:release`.
7. **"Request a copy of my data"** opens one pre-filled email to privacy@resbite.com. It carries the subject, one sentence and the account id. It never includes the number or the email: the team checks identity by A16's own route (`docs/compliance/data-requests.md`, section 4).
8. **Apple's button is black, "Continue with Apple", 44 points tall, a pill (corner radius 22) and full width,** so it is never smaller than the Google chip beside it. It also replaces the Apple chip on About you (Apple linking, `mobile/app/about-you.tsx:104-112`). It does not replace the Apple mark on Delete account (plan 2).
9. **Kept as they are:**
   - The Updates chip's "Not active yet" (`mobile/src/domain/notifications.ts:179`) shows only where nothing can register (web, preview, signed out) or when push is off, and the release check makes push on.
   - `SAFETY_COPY.reportsPrivacy` agrees with the documents (open point 1).
10. **Add your number gets a second line,** "We never show your number to other people on Resbite.", which section 3.1 of the Privacy Policy says. It explains the required number after Apple or Google sign-in (SI-5, guideline 5.1.1(v)).

## Review Focus

1. **A production build made without the support address, with push or deletion off, or with a broken legal-link override.** Expected: the EAS build stops at the release check, with one line naming each problem. A `development` or `preview` build is not stopped. Test: Task 2.
2. **A legal-link override that is http, contains a space or a hidden character, or is a bare word.** Expected: the app opens the canonical link.resbite.com page, never a broken link. Tests: Task 1 (unit, and the browser run built with overrides).
3. **A dependency added, removed or upgraded later** (the CAPTCHA SDK, an Expo upgrade). Expected: `npm test` fails until the licences file is regenerated and the privacy manifest covers every required reason the SDKs declare. Tests: Tasks 4 and 10.
4. **Larger Text at 320 points** on About and legal, Licences (long scoped names such as `@react-native-community/datetimepicker`) and Data & privacy. Expected: nothing is clipped and nothing is wider than the screen. Tests: Tasks 4, 5 and 6 (`verify-legal.mjs`).
5. **The tick line in every wording it will have.** Today's line is "I agree to the Terms and Privacy Policy.". Plan 4's (B2) is "Read the Terms of Use. Our Privacy Policy explains how we use your data.". Expected: each document name is one whole link to the right page, a word that merely starts with "Terms" stays plain, and a line with no name is plain text. Test: Task 1.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `mobile/src/domain/legal.ts` (create) | The legal URLs and overrides, `PRIVACY_ADDRESS`, `COMPANY`, `LEGAL_COPY`, `termsRuns`, `dataRequestMailto` | 1, 6 |
| `mobile/src/services/externalLinks.ts` (create) | `openExternal`: one way to open a link or `mailto:` outside the app | 1 |
| `mobile/src/design/LegalLinks.tsx` (create) | `ExternalLink` and `LegalLinks` (Privacy Policy, Terms of Use, Support) | 1 |
| `mobile/src/design/TickRow.tsx` (modify `:60-108`) | `TermsLine` from `termsRuns` and `ExternalLink` | 1 |
| `mobile/app/index.tsx`, `mobile/app/auth/phone.tsx`, `mobile/app/auth/index.tsx` (modify) | The links on the welcome and sign-in screens | 1 |
| `mobile/.env.example` (modify) | `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_URL`; the support line | 1 |
| `mobile/src/domain/releaseChecks.ts`, `mobile/scripts/check-release.mjs` (create) | The production release check and its runner | 2 |
| `mobile/package.json`, `mobile/package-lock.json` (modify) | The test chain, `check:release`, the EAS hook, two packages removed | 1–10 |
| `mobile/app.json` (modify) | No location plugin, the contacts string, the Android permissions, version 1.0.0, `ios.privacyManifests` | 3, 10 |
| `mobile/src/services/contacts.ts` (modify `:7-11`, `:65-89`, `:119-129`) | Names and numbers only from Contacts | 3 |
| `mobile/app/people.tsx` (modify `:435`) | The skipped-contacts label without "email" | 3 |
| `mobile/src/domain/licenceNotices.ts`, `mobile/scripts/generate-licences.mjs` (create) | Build and write the notices from the dependency tree | 4 |
| `mobile/src/domain/licences.json` (generated), `mobile/src/domain/licences.ts` (create) | The notices and their reading helpers | 4 |
| `mobile/app/licences.tsx` (create) | The Licences screen | 4 |
| `mobile/app/about-legal.tsx` (create) | The About and legal screen | 5 |
| `mobile/app/_layout.tsx` (modify `:131-132`) | Stack entries `licences` and `about-legal` | 4, 5 |
| `mobile/src/domain/privacyCopy.ts` (create) | Data & privacy's topics and its About text | 6 |
| `mobile/app/data-privacy.tsx` (modify `:1-175`) | The rewritten page, the Privacy Policy, Request a copy and About and legal rows | 6 |
| `mobile/app/(tabs)/wellness.tsx` (delete), `mobile/app/(tabs)/_layout.tsx` (`:46-52`), `mobile/app/(tabs)/_layout.web.tsx` (`:3`, `:37`) | No Wellness tab | 7 |
| `mobile/src/domain/accountCopy.ts` (`:1`, `:55-68`), `src/services/rsvp.ts:77`, `src/domain/notifications.ts:19-21,40`, `src/services/pushDevice.ts:109`, `src/domain/phoneCopy.ts:38`, `mobile/app/activity/[id].tsx:83`, `mobile/app/auth/index.tsx:257-259` | Sample, beta and test wording | 7 |
| `mobile/src/state/useAuthFlow.ts`, `mobile/app/auth/index.tsx` | The dead sign-up code removed | 8 |
| `mobile/src/design/AppleButton.tsx` (create); `auth/index.tsx`, `auth/phone.tsx`, `about-you.tsx` | Apple's own button | 9 |
| `mobile/src/domain/phoneCopy.ts`, `mobile/app/add-phone.tsx:58` | The number explanation | 9 |
| New tests: `src/domain/legal.test.ts`, `src/services/externalLinks.test.ts`, `src/domain/releaseChecks.test.ts`, `src/domain/appConfig.test.ts`, `src/domain/licenceNotices.test.ts`, `src/domain/privacyCopy.test.ts`, `src/domain/releaseWording.test.ts`, `src/domain/authScreens.test.ts` | As named in each task | 1–10 |
| Changed tests: `src/domain/supportContact.test.ts`, `accountCopy.test.ts`, `notifications.test.ts`, `circle.test.ts`, `src/services/phoneFold.test.ts`, `contacts.test.ts`, `nativeImports.test.ts` | Their expectations follow the new copy and code | 3, 6, 7 |
| `mobile/scripts/verify-legal.mjs` (create) | Browser checks for this plan's screens | 1, 4, 5, 6, 7 |
| `mobile/scripts/verify-deletion.mjs`, `review-ui.mjs`, `verify-planning.mjs`, `verify-notifications.mjs`, `verify-contact-invites.mjs`, `verify-phone.mjs` (modify) | Their expectations follow the new copy | 6, 7, 9 |
| `mobile/README.md`, `docs/implementation-status.md`, `qa/app-store-release/README.md`, `knowledge-base/08-decisions.md` (modify) | The records | 11 |

### How to run the browser checks

From `mobile/`, without `.env.local`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://ewcsgvhuojxdpaspwsrx.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stand-in-key npx expo start --web --port 8081 --clear
```

- Run it in the background and wait for "Waiting on http://localhost:8081" before the first request.
- The scripts route every `*.supabase.co` request, so nothing reaches the hosted project. The project ref is already public in `README.md:12`.
- Restart Expo with `--clear` after the last edit: with `CI=1`, Expo does not watch files.
- Each script prints `PASS …` lines and exits 0.

---

### Task 1: Legal URLs, the tick's links and the links on the first screens (B1)

**Files:**
- Create: `mobile/src/domain/legal.ts`, `mobile/src/domain/legal.test.ts`, `mobile/src/services/externalLinks.ts`, `mobile/src/services/externalLinks.test.ts`, `mobile/src/design/LegalLinks.tsx`, `mobile/scripts/verify-legal.mjs`
- Modify:
  - `mobile/src/design/TickRow.tsx:60-108` (`TermsLine`);
  - `mobile/app/index.tsx:56-72` (below the Get started block);
  - `mobile/app/auth/phone.tsx:123-131` (sign-in only, after the links view);
  - `mobile/app/auth/index.tsx:229-256` (after the links view, every mode);
  - `mobile/.env.example:11-14`;
  - `mobile/package.json:68` (the test chain);
  - `mobile/src/domain/deletion.ts`, only if plan 2 has created it (`PRIVACY_ADDRESS` becomes a re-export; add it to the commit).

**Interfaces:**
- Consumes: `hasHiddenCharacter(text)` (`mobile/src/domain/chatRules.ts:518`).
- Produces, in `src/domain/legal.ts`:
  - `LEGAL_SITE = "https://link.resbite.com"`.
  - `type LegalUrls = { privacy: string; terms: string; communityRules: string; support: string }`.
  - `httpsUrl(value: string | undefined): string | null`. It trims the value and returns it only when `new URL(value)` parses, the protocol is `https:`, the hostname contains a dot, and the value has no blank and no hidden character (`hasHiddenCharacter`). Otherwise it returns null.
  - `legalUrls(env: { terms: string | undefined; privacy: string | undefined }): LegalUrls`. Each of `terms` and `privacy` is `httpsUrl(override)` or the canonical URL. `communityRules` is `terms` without any `#…`, plus `#community-rules`. `support` is always `${LEGAL_SITE}/support`.
  - `LEGAL_URLS: LegalUrls = legalUrls({ terms: process.env.EXPO_PUBLIC_TERMS_URL, privacy: process.env.EXPO_PUBLIC_PRIVACY_URL })`.
  - `PRIVACY_ADDRESS = "privacy@resbite.com"`. This plan owns it. If plan 2's Task 7 has already declared it in `mobile/src/domain/deletion.ts`, change that line to `export { PRIVACY_ADDRESS } from "./legal";` in this task's commit.
  - `COMPANY = { name: "Resbite Ltd", number: "12450334", office: "86-90 Paul Street, London EC2A 4NE, United Kingdom" } as const`.
  - `LEGAL_COPY` (exact):
    - `privacyPolicy: "Privacy Policy"`, `termsOfUse: "Terms of Use"`, `communityRules: "Community rules"`, `support: "Support"`, `licences: "Licences"`, `aboutLegal: "About and legal"`, `companyDetails: "Company details"`, `requestData: "Request a copy of my data"`;
    - `opensInBrowser: "Opens in your browser"`, `opensEmail: (address: string) => \`Opens an email to ${address}\``;
    - `requestDataFailed: (address: string) => \`Your phone couldn’t open an email. Write to ${address} and ask for a copy of your data.\``;
    - `companyLines: ["Resbite is provided by Resbite Ltd, a private limited company registered in England and Wales.", "Company number: 12450334", "Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom"]`;
    - `dataProtection: (address: string) => \`Data protection: ${address}\``, `help: (address: string) => \`Help and reports: ${address}\``;
    - `licencesIntro: "Resbite is built with open-source software and fonts. Their licences are below."`;
    - `licenceSections: { fonts: "Fonts", packages: "Open-source software", native: "Built into React Native" }`;
    - `noLicenceText: (licence: string) => \`This package doesn’t include a licence file. Its licence is ${licence}.\``;
    - `nativeLicence: (licence: string) => \`React Native builds this library into the app. Its licence is ${licence}.\``;
    - `dataRequestSubject: "Request a copy of my data"`, `dataRequestBody: "Please send me a copy of the personal data Resbite holds about me."`, `dataRequestAccount: (id: string) => \`My Resbite account ID: ${id}\``.
  - `type TermsRun = { text: string; url?: string }`.
  - `termsRuns(text: string, urls: Pick<LegalUrls, "terms" | "privacy">): TermsRun[]`. It scans left to right. At each position it links the longest of "Terms of Use" (terms), "Privacy Policy" (privacy) and "Terms" (terms), but only when the character after the match is not a letter. Adjacent plain runs merge, and no run is empty.
- Produces, in `src/services/externalLinks.ts`: `openExternal(url: string, open?: (url: string) => Promise<unknown>): Promise<boolean>`.
  - The default `open` lazily requires only `Linking` from `react-native`, as `src/services/contacts.ts:111` reads only `Platform`.
  - It answers true when `open` resolves, and false when it rejects or throws.
- Produces, in `src/design/LegalLinks.tsx`:
  - `ExternalLink({ title, url }: { title: string; url: string })`: a `Pressable` with `accessibilityRole="link"`, `accessibilityLabel={title}` and `accessibilityHint={LEGAL_COPY.opensInBrowser}`, at least 44 points tall. Its text is `c.aquaDark` and 13 points, and it calls `openExternal(url)`.
  - `LegalLinks({ align = "center" }: { align?: "center" | "start" })`: a wrapping row of `ExternalLink`s for Privacy Policy, Terms of Use and Support, from `LEGAL_URLS`.
- `TermsLine({ text })` keeps its props, its plain-text style and its "full stop stays with the last link" rule (`TickRow.tsx:84-105`). It builds runs with `termsRuns(text, LEGAL_URLS)` and draws each link run as `ExternalLink`. The early return for unset variables (`:70`) goes. A text with no document name still renders as one plain `Copy`.

- [ ] **Step 1: Write the failing unit tests** in `src/domain/legal.test.ts` and `src/services/externalLinks.test.ts`.
  - `httpsUrl`:
    - `" https://legal.example.test/terms "` → `"https://legal.example.test/terms"`;
    - each of `undefined`, `""`, `"   "`, `"http://legal.example.test/terms"`, `"terms"`, `"https://legal example.test/terms"`, `"https://localhost/terms"` and `"https://legal.example.test/te​rms"` → null.
  - `legalUrls({ terms: undefined, privacy: undefined })` deep-equals `{ privacy: "https://link.resbite.com/privacy", terms: "https://link.resbite.com/terms", communityRules: "https://link.resbite.com/terms#community-rules", support: "https://link.resbite.com/support" }`.
  - `legalUrls({ terms: "https://legal.example.test/t#old", privacy: "http://legal.example.test/p" })` gives `terms` `"https://legal.example.test/t#old"`, `communityRules` `"https://legal.example.test/t#community-rules"` and `privacy` `"https://link.resbite.com/privacy"`.
  - `termsRuns` with `urls = { terms: "T", privacy: "P" }`:
    - `"I agree to the Terms and Privacy Policy."` → `[{text:"I agree to the "},{text:"Terms",url:"T"},{text:" and "},{text:"Privacy Policy",url:"P"},{text:"."}]`;
    - plan 4's line, `"Read the Terms of Use. Our Privacy Policy explains how we use your data."` → `[{text:"Read the "},{text:"Terms of Use",url:"T"},{text:". Our "},{text:"Privacy Policy",url:"P"},{text:" explains how we use your data."}]`;
    - `"I’m 18 or over and I accept the Terms of Use."` → `[{text:"I’m 18 or over and I accept the "},{text:"Terms of Use",url:"T"},{text:"."}]`;
    - `"Termsheet and Privacy Policyholder"` → `[{text:"Termsheet and Privacy Policyholder"}]`;
    - `"Nothing to link."` → `[{text:"Nothing to link."}]`.
  - `COMPANY` and `LEGAL_COPY.companyLines`: exactly the strings above. `PRIVACY_ADDRESS === "privacy@resbite.com"`.
  - A source check, in the shape of `supportContact.test.ts:51-73`: every non-test file under `app/` and `src/` that names `EXPO_PUBLIC_TERMS_URL` or `EXPO_PUBLIC_PRIVACY_URL` reads it as `process.env.EXPO_PUBLIC_…` with dot notation.
  - `mobile/.env.example` contains the lines `# EXPO_PUBLIC_TERMS_URL=` and `# EXPO_PUBLIC_PRIVACY_URL=`.
  - `TickRow.tsx` contains `termsRuns(` and no `Linking.openURL` (links go through `openExternal`).
  - `openExternal("https://x.example/a", async () => {})` → true, and the stub was called with that URL. It gives false when the stub rejects, and false when the stub throws synchronously.
- [ ] **Step 2: Run them to see them fail:** `cd mobile && node --import tsx src/domain/legal.test.ts && node --import tsx src/services/externalLinks.test.ts` → FAIL ("Cannot find module './legal'").
- [ ] **Step 3: Write the browser check** `scripts/verify-legal.mjs`.
  - Its shape follows `scripts/verify-auth.mjs:1-30`: Chrome, `RESBITE_QA_URL`, abort `**/*.supabase.co/**`, no page errors.
  - An init script records `window.open` calls (`window.__opened = []`, then `window.open = (u) => { window.__opened.push(String(u)); return null; }`). react-native-web's `Linking.openURL` calls `window.open(url, "_blank", "noopener")` (`node_modules/react-native-web/dist/exports/Linking/index.js:76-102`).
  - Helper: `link(page, name)` returns `visible(page.getByRole("link", { name, exact: true }))`.
  - Expected URLs: `TERMS = process.env.EXPECT_TERMS_URL || "https://link.resbite.com/terms"`, and `PRIVACY = "https://link.resbite.com/privacy"` in both runs.
  - Sections:
    - **(l1) The welcome screen,** 390 px. "Get together" is shown. The links Privacy Policy, Terms of Use and Support are each at least 44 px tall. Clicking each in turn records `[PRIVACY, TERMS, "https://link.resbite.com/support"]`.
    - **(l2) `/auth?mode=login`, then `/auth/phone?intent=signin`:** the same three links, recording the same URLs.
    - **(l3) `/auth/phone` (sign-up):**
      - the tick line has the link "Terms" (opens TERMS) and "Privacy Policy" (opens PRIVACY);
      - the screen has no "Support" link and no "Terms of Use" link;
      - the tick is still unticked after both clicks.
  - The second run (Review Focus 2): restart Expo with `EXPO_PUBLIC_TERMS_URL=https://legal.example.test/terms EXPO_PUBLIC_PRIVACY_URL=http://legal.example.test/privacy`, then run with `EXPECT_TERMS_URL=https://legal.example.test/terms`. Terms opens the override, and Privacy Policy opens the canonical page.
- [ ] **Step 4: Implement** `legal.ts`, `externalLinks.ts`, `LegalLinks.tsx` and the new `TermsLine`.
  - Place `<LegalLinks />` on the welcome screen inside the `Reveal`, after the `View` that holds Get started and "I have an account" (`index.tsx:56-72`).
  - Place it on `auth/phone.tsx` only when `!signup && !code`, after the links view at `:127-129`.
  - Place it on `auth/index.tsx` after the links view (`:229-256`), with `align="start"`.
  - Add to `.env.example`, after the support lines:

    ```
    # App Store readiness plan 3: the Terms of Use and Privacy Policy links. Optional: unset, the app uses
    # https://link.resbite.com/terms and https://link.resbite.com/privacy. Set one only if the pages move; an https link only.
    # EXPO_PUBLIC_TERMS_URL=
    # EXPO_PUBLIC_PRIVACY_URL=
    ```

  - Append both test files to the `test` chain in `package.json`.
- [ ] **Step 5: Run the checks.**
  - `npm run check` → PASS (every test, typecheck clean).
  - Start Expo as in "How to run the browser checks", then `node scripts/verify-legal.mjs` → `PASS (l1)`, `PASS (l2)`, `PASS (l3)`.
  - Restart Expo with the two overrides and run `EXPECT_TERMS_URL=https://legal.example.test/terms node scripts/verify-legal.mjs` → the same three PASS lines.
  - `node scripts/verify-auth.mjs` and `node scripts/verify-phone.mjs` → PASS (nothing else on those screens changed).
- [ ] **Step 6: Commit.**

```bash
git add mobile/src/domain/legal.ts mobile/src/domain/legal.test.ts mobile/src/services/externalLinks.ts mobile/src/services/externalLinks.test.ts mobile/src/design/LegalLinks.tsx mobile/src/design/TickRow.tsx mobile/app/index.tsx mobile/app/auth/phone.tsx mobile/app/auth/index.tsx mobile/.env.example mobile/package.json mobile/scripts/verify-legal.mjs
git commit -m "App Store readiness: legal links that always work, on the first screens and the 18+ tick"
```

### Task 2: The release check (B1's release test, B4's push on, B3's deletion flag)

**Files:**
- Create: `mobile/src/domain/releaseChecks.ts`, `mobile/src/domain/releaseChecks.test.ts`, `mobile/scripts/check-release.mjs`
- Modify: `mobile/package.json:62-69` (scripts)

**Interfaces:**
- Consumes:
  - `supportAddress(env)` (`src/domain/safetyCopy.ts:103-107`);
  - `httpsUrl` and `legalUrls` (Task 1);
  - the push switch, which is the string `"true"` (`src/services/pushDevice.ts:20-21`).
- Produces:
  - `type ReleaseEnv = Readonly<Record<string, string | undefined>>`.
  - `releaseProblems(env: ReleaseEnv): string[]`. It returns these lines, in this order, each only when it applies:
    - `"EXPO_PUBLIC_SUPPORT_ADDRESS must be the support email address."` when `supportAddress(env.EXPO_PUBLIC_SUPPORT_ADDRESS)` is null;
    - `"EXPO_PUBLIC_TERMS_URL is set but is not an https link."` when it is non-blank and `httpsUrl` is null;
    - `"EXPO_PUBLIC_PRIVACY_URL is set but is not an https link."`, likewise;
    - `"EXPO_PUBLIC_PUSH_ENABLED must be \"true\"."` when it is not exactly `"true"`;
    - `"EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED must be \"true\"."` when it is not exactly `"true"` (`mobile/src/services/accountDeletion.ts:11-12` reads it so). A store build without in-app deletion is a certain rejection (guideline 5.1.1(v), spec blocker 1). Plan 2's Rollout step 8 sets it once its deletion release is live; every app plan rides that one submission build (roadmap), so no earlier production build is planned.
  - `scripts/check-release.mjs`, run as `node --import tsx scripts/check-release.mjs`:
    - when `EAS_BUILD_PROFILE` is set and is not `production`, it prints `Release check skipped: build profile "<profile>" is not production.` and exits 0;
    - otherwise, with problems, it prints `Release check failed:` and then each problem on its own line, and exits 1;
    - with none, it prints `PASS release check: support address set, push on, deletion on, Privacy Policy <url>, Terms of Use <url>, Support <url>.` with the effective URLs from `legalUrls`, and exits 0.
    - It never prints the support address. It is public, but build logs are not a place for values.
  - `package.json` scripts: `"check:release": "node --import tsx scripts/check-release.mjs"` and `"eas-build-post-install": "npm run check:release"`.

- [ ] **Step 1: Write the failing tests** in `releaseChecks.test.ts`.
  - With `GOOD = { EXPO_PUBLIC_SUPPORT_ADDRESS: "help@x.example", EXPO_PUBLIC_PUSH_ENABLED: "true", EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED: "true" }`, `releaseProblems(GOOD)` is `[]`.
  - `releaseProblems({})` deep-equals the support line, the push line and the deletion line, in that order.
  - Each of `"help"`, `" "` and `"a b@x.example"` as the address gives the support line.
  - `EXPO_PUBLIC_PUSH_ENABLED: "TRUE"` gives the push line. `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED: "false"` gives exactly the deletion line.
  - `EXPO_PUBLIC_TERMS_URL: "http://legal.example.test/t"` gives exactly the Terms line. `"  "` gives none.
  - `EXPO_PUBLIC_PRIVACY_URL: "https://legal.example.test/p"` gives none.
  - The runner, with `spawnSync(process.execPath, ["--import", "tsx", "scripts/check-release.mjs"], { cwd: <mobile>, env })` and only these variables plus `PATH`:
    - `{ EAS_BUILD_PROFILE: "preview" }` → status 0, and stdout contains `Release check skipped: build profile "preview" is not production.`;
    - `{ EAS_BUILD_PROFILE: "production" }` → status 1, and stderr or stdout contains the support line, the push line and the deletion line;
    - `{ EAS_BUILD_PROFILE: "production", ...GOOD }` → status 0, stdout starts with `PASS release check:` and contains `https://link.resbite.com/terms`, and output does not contain `help@x.example`.
  - `package.json`'s `eas-build-post-install` is `"npm run check:release"`.
- [ ] **Step 2: Run it to see it fail:** `node --import tsx src/domain/releaseChecks.test.ts` → FAIL.
- [ ] **Step 3: Implement** both files and the two scripts. Append the test to the chain.
- [ ] **Step 4: Run** `npm run check` → PASS. `EAS_BUILD_PROFILE=preview npm run check:release` → the skip line, exit 0. `npm run check:release` with no variables → `Release check failed:` and three lines, exit 1 (expected: no production values on this box).
- [ ] **Step 5: Commit.**

```bash
git add mobile/src/domain/releaseChecks.ts mobile/src/domain/releaseChecks.test.ts mobile/scripts/check-release.mjs mobile/package.json
git commit -m "App Store readiness: a production build stops without the support address, or with push or deletion off"
```

### Task 3: Permissions clean-up (B8)

**Files:**
- Create: `mobile/src/domain/appConfig.test.ts`
- Modify:
  - `mobile/package.json:17,36` and `mobile/package-lock.json` (with `npm uninstall`);
  - `mobile/app.json:22-27` (Android permissions), `:57-65` (the `expo-location` plugin), `:69` (contacts string);
  - `mobile/src/services/contacts.ts:7-11`, `:65-89`, `:119-129`;
  - `mobile/app/people.tsx:435`;
  - `mobile/src/services/contacts.test.ts:58-85`, `:101-117`, `:139-154`;
  - `mobile/src/services/nativeImports.test.ts:46-77`.

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - Contacts are read with `[ContactField.FULL_NAME, ContactField.PHONES]` only.
  - `ContactRow` is `{ fullName?: string | null; phones?: { number?: string | null }[] }`. `readContactPage` builds people from phone numbers only. `missing` counts rows with no usable phone.
  - `app.json`:
    - the contacts plugin string is exactly "Choose contacts to invite. Resbite checks only the numbers you pick to see who already uses it." (PERM-1);
    - `android.permissions` is `["android.permission.READ_CONTACTS"]`;
    - there is no `expo-location` plugin, so the location and motion strings go;
    - the calendar and reminders strings stay (`app.json:73-78`; the `expo-calendar` plugin writes them).
  - `people.tsx:435`'s label reads `` `${missing} contacts without a usable phone number were skipped.` ``.
  - `appConfig.test.ts` (extended in Task 10) reads `app.json` and `package.json` with `readFileSync`.

- [ ] **Step 1: Write the failing tests.**
  - `appConfig.test.ts`:
    - `package.json` `dependencies` has no `expo-location` and no `@react-native-async-storage/async-storage`;
    - `app.json` `plugins` has no entry named `expo-location` (a string or `[name, …]`);
    - the `expo-contacts` entry's `contactsPermission` is the string above;
    - `android.permissions` deep-equals `["android.permission.READ_CONTACTS"]`;
    - no key or string anywhere in `app.json` contains "location" (case-insensitive).
  - `nativeImports.test.ts`: give the fake `ContactField` the values `{ FULL_NAME: "name", EMAILS: "emails", PHONES: "phones" }` and record `getAllDetails`'s first argument. The test "the native read asks Contacts for names and phone numbers only (B8, PERM-3)" asserts `deepEqual(fields, ["name", "phones"])`.
  - `contacts.test.ts`:
    - the "limited pages…" test (`:58-85`) keeps its rows, but expects `page.missing === 2` and keys `["phone:+447700900123", "phone:07700900123"]`, with `people[1].name === "Unnamed contact"`. An email on a row is ignored even when the adapter returns one;
    - in `:101-117`, the revoked-permission row becomes `{ fullName: "Private", phones: [{ number: "07700 900999" }] }`;
    - in `:139-154`, drop `emails` from the first row.
- [ ] **Step 2: Run them to see them fail:** `node --import tsx src/domain/appConfig.test.ts && node --import tsx src/services/nativeImports.test.ts && node --import tsx src/services/contacts.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - From `mobile/`, run `npm uninstall expo-location @react-native-async-storage/async-storage`. Only those two packages and their lockfile entries change: check with `git diff --stat mobile/package-lock.json`.
  - Edit `app.json`, `contacts.ts` and `people.tsx` as above.
  - Append `appConfig.test.ts` to the chain.
- [ ] **Step 4: Run** `npm run check` → PASS. Then `npx expo config --type public --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s);console.log(JSON.stringify(c.plugins.map(p=>Array.isArray(p)?p[0]:p)))})'` → the list has no `expo-location`. Then `node scripts/verify-people.mjs` → PASS.
- [ ] **Step 5: Commit.**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app.json mobile/src/services/contacts.ts mobile/src/services/contacts.test.ts mobile/src/services/nativeImports.test.ts mobile/src/domain/appConfig.test.ts mobile/app/people.tsx
git commit -m "App Store readiness: no location or unused storage library, and only names and numbers from Contacts"
```

### Task 4: Licences (A25, CON-11)

**Files:**
- Create:
  - `mobile/src/domain/licenceNotices.ts`, `mobile/src/domain/licenceNotices.test.ts`;
  - `mobile/scripts/generate-licences.mjs`;
  - `mobile/src/domain/licences.json` (generated, committed), `mobile/src/domain/licences.ts`;
  - `mobile/app/licences.tsx`.
- Modify:
  - `mobile/app/_layout.tsx:131-132` (`<Stack.Screen name="licences" />` after `delete-account`, outside the protected groups);
  - `mobile/package.json` (the test chain);
  - `mobile/scripts/verify-legal.mjs` (section l4).

**Interfaces:**
- Consumes: `LEGAL_COPY.licences`, `licencesIntro`, `licenceSections`, `noLicenceText` and `nativeLicence` (Task 1); `Back`, `Copy`, `Title` and `s` (`src/design/ui.tsx`); `InfoSheet` (`src/design/kit.tsx:762`).
- Produces, in `licenceNotices.ts`, with no `fs`: callers inject the reader.
  - Types:
    - `type LockEntry = { version?: string; license?: string; dev?: boolean; devOptional?: boolean; optional?: boolean }`;
    - `type LockFile = { packages: Record<string, LockEntry> }`;
    - `type LicenceReader = { read(path: string): string | null; list(dir: string): string[] | null }`, with paths relative to `mobile/` and `list` giving the file names in a directory, not subdirectories;
    - `type FontNotice = { name: string; licence: string; text: string }`;
    - `type NativeNotice = { name: string; version: string; licence: string }`;
    - `type PackageNotice = { name: string; version: string; licence: string; texts: number[] }`;
    - `type Licences = { fonts: FontNotice[]; packages: PackageNotice[]; native: NativeNotice[]; texts: string[] }`.
  - `buildLicences(lock: LockFile, reader: LicenceReader): Licences`, with these rules:
    1. **Packages.** It reads every `lock.packages` key that starts with `node_modules/` and whose entry is not `dev`, `devOptional` or `optional`. The optional ones are platform binaries, so the output is the same on a Mac and on Linux.
       - The name is the text after the last `node_modules/`, and the version is `entry.version`.
       - It keeps the first of each `name@version`, and sorts by name, then version.
    2. **The licence.** It takes the installed `package.json`'s `license` when that is a string. Otherwise it takes `license.type`, then the `licenses[].type` values joined with `" OR "`, then the lock's `license`, then `"Unknown"`.
    3. **The texts.** It reads the package folder's files whose lower-case name starts with `licen`, `copying` or `notice`, sorted case-insensitively.
       - Each is read as text, with `\r\n` turned into `\n` and the text trimmed. Empty ones are skipped.
       - Identical texts are stored once in `texts`, and each package lists their indices.
    4. **The fonts.** `[{ name: "Montserrat", licence: "OFL-1.1", text: <assets/fonts/Montserrat-OFL.txt> }, { name: "Quicksand", licence: "OFL-1.1", text: <assets/fonts/Quicksand-OFL.txt> }]`, trimmed. It throws if either file is missing.
    5. **Native.** Every `node_modules/react-native/third-party-podspecs/*.podspec` except `ReactNativeDependencies.podspec`.
       - The name comes from `spec.name = '…'` (either quote).
       - The version comes from a literal `spec.version = '…'`, else `"bundled"`.
       - The licence comes from `spec.license = { :type => '…'`, else `"Unknown"`.
       - Sorted by name.
  - `licences.ts`:
    - `LICENCES: Licences` (`import data from "./licences.json"`);
    - `packageText(p: PackageNotice, texts: readonly string[]): string`: the texts joined by a blank line, or `LEGAL_COPY.noLicenceText(p.licence)` when there are none.
  - `scripts/generate-licences.mjs`, run as `node --import tsx scripts/generate-licences.mjs` from `mobile/`. It reads `package-lock.json`, builds with an fs-backed reader, writes `src/domain/licences.json` as `JSON.stringify(licences, null, 2) + "\n"`, and prints `wrote <n> packages, <m> texts, 2 fonts, <k> native libraries`.
  - `app/licences.tsx` (route `/licences`):
    - `Back` labelled "About and legal", the title `LEGAL_COPY.licences` and `licencesIntro`;
    - a `SectionList` with three sections, Fonts, Open-source software and Built into React Native, titled from `licenceSections`, with section headers as `accessibilityRole="header"`;
    - each row is a `Pressable` (`accessibilityRole="button"`, at least 44 points tall). It shows `<name> <version>` (a font shows its name only) and, below it, the licence id. Its label is `"<name> <version>, <licence>"`;
    - a press opens an `InfoSheet` titled with the name. The body is the font's text, `packageText(...)`, or `LEGAL_COPY.nativeLicence(licence)`, as selectable `Copy`;
    - `require` the JSON inside the component (`const { LICENCES } = require("../src/domain/licences") as typeof import("../src/domain/licences")`), so it is parsed only when the screen opens.

- [ ] **Step 1: Write the failing test** `licenceNotices.test.ts`. It uses an fs reader rooted at `mobile/`: `read` with `readFileSync(…, "utf8")` (null on error), and `list` with `readdirSync(…, { withFileTypes: true })` filtered to files.
  - **Drift:** `deepEqual(buildLicences(JSON.parse(readFileSync("package-lock.json")), reader), JSON.parse(readFileSync("src/domain/licences.json")))`, with the message "run node --import tsx scripts/generate-licences.mjs".
  - **Coverage:** the set of `name@version` in the output equals the set computed from the lockfile by rule 1. No `dev` lockfile entry appears (for example `typescript`, `tsx` or `@playwright/test`, unless the lockfile marks them prod). `expo-location` and `@react-native-async-storage/async-storage` are absent.
  - **Fonts:** both texts contain "SIL Open Font License, Version 1.1". Montserrat's starts with "Copyright 2011 The Montserrat Project Authors".
  - **Spot checks:** `react-native`'s entry has licence `"MIT"` and a text containing "Meta Platforms". `native` names include `boost` (licence "Boost Software License", version "1.84.0") and `glog`, and never `ReactNativeDependencies`.
  - **Pure rules** with an in-memory reader:
    - a package with `LICENSE` and `NOTICE` lists both, in that order;
    - two packages with the same `LICENSE` share one index;
    - a package with no file gives `texts: []`, and `packageText` gives "This package doesn’t include a licence file. Its licence is MIT.";
    - `licenses: [{type:"MIT"},{type:"Apache-2.0"}]` gives `"MIT OR Apache-2.0"`;
    - an `optional` entry is left out.
- [ ] **Step 2: Run it to see it fail:** `node --import tsx src/domain/licenceNotices.test.ts` → FAIL.
- [ ] **Step 3: Implement** `licenceNotices.ts` and `generate-licences.mjs`. Run the generator (from `mobile/`, after Task 3's uninstall) and commit its output. Then write `licences.ts`, `app/licences.tsx` and the Stack entry, and append the test to the chain.
- [ ] **Step 4: Extend `verify-legal.mjs` with (l4).**
  - Go to `${base}/licences` at 390 px. The heading is "Licences", followed by the intro.
  - The headers Fonts, Open-source software and Built into React Native appear in that order.
  - Montserrat opens a sheet with "SIL Open Font License, Version 1.1". Close it.
  - Scroll to and press "react-native 0.86.3, MIT": its sheet contains "Meta Platforms".
  - Then 320 px under Larger Text, built as `review-ui.mjs:251-284` does (`?largeText=1`, `[dir="auto"] { zoom: 1.4; }`, its `fits` and `clipped` checks). Scroll to `@react-native-community/datetimepicker`: the page fits and nothing is clipped (Review Focus 4).
- [ ] **Step 5: Run** `npm run check` → PASS. Start Expo once (the new route), then `node scripts/verify-legal.mjs` → `PASS (l1)` to `PASS (l4)`.
- [ ] **Step 6: Commit.**

```bash
git add mobile/src/domain/licenceNotices.ts mobile/src/domain/licenceNotices.test.ts mobile/scripts/generate-licences.mjs mobile/src/domain/licences.json mobile/src/domain/licences.ts mobile/app/licences.tsx mobile/app/_layout.tsx mobile/package.json mobile/scripts/verify-legal.mjs
git commit -m "App Store readiness: a Licences screen generated from the dependency tree, with the font licences"
```

### Task 5: About and legal (B1, DOC-3, UGC-4)

**Files:**
- Create: `mobile/app/about-legal.tsx`
- Modify: `mobile/app/_layout.tsx` (`<Stack.Screen name="about-legal" />` beside `licences`); `mobile/scripts/verify-legal.mjs` (section l5)

**Interfaces:**
- Consumes:
  - `LEGAL_URLS`, `LEGAL_COPY`, `PRIVACY_ADDRESS` and `openExternal` (Task 1);
  - `supportAddress` (`safetyCopy.ts:103`), called with `process.env.EXPO_PUBLIC_SUPPORT_ADDRESS`;
  - `Row` and `RowGroup` (`src/design/kit.tsx:873`);
  - lucide icons `FileText`, `ScrollText`, `UsersRound`, `LifeBuoy` and `BookOpen` (checked present in lucide-react-native 1.47.0).
- Produces: the route `/about-legal`. Its parts, in order:
  - `Back` labelled "Privacy", and the title "About and legal".
  - `RowGroup` 1:
    - Privacy Policy (`FileText`) → `openExternal(LEGAL_URLS.privacy)`;
    - Terms of Use (`ScrollText`) → `.terms`;
    - Community rules (`UsersRound`) → `.communityRules`;
    - Support (`LifeBuoy`) → `.support`.
    - Each has `hint={LEGAL_COPY.opensInBrowser}`.
  - `RowGroup` 2: Licences (`BookOpen`) → `router.push("/licences")`.
  - "Company details" as a `Copy` with `accessibilityRole="header"`, then as selectable `Copy`:
    - each of `LEGAL_COPY.companyLines`;
    - `LEGAL_COPY.dataProtection(PRIVACY_ADDRESS)`;
    - `LEGAL_COPY.help(address)` only when `supportAddress(...)` is not null.

- [ ] **Step 1: Extend `verify-legal.mjs` with (l5).** Go to `${base}/about-legal` at 390 px.
  - The heading is "About and legal".
  - Clicking the four rows records `[PRIVACY, TERMS, TERMS_BASE + "#community-rules", "https://link.resbite.com/support"]`, where `TERMS_BASE` is TERMS without its fragment.
  - Licences opens the "Licences" heading. Back returns.
  - The three company lines and "Data protection: privacy@resbite.com" are visible. The first line's computed `user-select` is `text`.
  - "Help and reports:" appears only when the script runs with `EXPECT_SUPPORT=<address>`. In that case it reads `Help and reports: <address>`, after a restart of Expo with that `EXPO_PUBLIC_SUPPORT_ADDRESS`.
  - At 320 px under Larger Text the page fits and nothing is clipped.
- [ ] **Step 2: Run it to see it fail:** `node scripts/verify-legal.mjs` → FAIL at (l5) (no such route).
- [ ] **Step 3: Implement** the screen and the Stack entry. Start Expo once for typed routes. Run `npm run typecheck` → clean.
- [ ] **Step 4: Run** `npm run check` → PASS. `node scripts/verify-legal.mjs` → `PASS (l1)` to `PASS (l5)`. Restart Expo with `EXPO_PUBLIC_SUPPORT_ADDRESS=help@x.example` and run `EXPECT_SUPPORT=help@x.example node scripts/verify-legal.mjs` → PASS, with the help line.
- [ ] **Step 5: Commit.**

```bash
git add mobile/app/about-legal.tsx mobile/app/_layout.tsx mobile/scripts/verify-legal.mjs
git commit -m "App Store readiness: About and legal, with the documents, community rules, support, licences and company details"
```

### Task 6: Data & privacy rewritten, and "Request a copy of my data" (B5, B14, B4 in part)

**Files:**
- Create: `mobile/src/domain/privacyCopy.ts`, `mobile/src/domain/privacyCopy.test.ts`
- Modify:
  - `mobile/src/domain/legal.ts` and `legal.test.ts` (`dataRequestMailto`);
  - `mobile/app/data-privacy.tsx:1-175` (keep `ContactTopic`, `:177-223`, and the styles);
  - `mobile/src/domain/supportContact.test.ts:75-101`;
  - `mobile/scripts/verify-deletion.mjs:37-38` and `:232-282`;
  - `mobile/scripts/review-ui.mjs:140-166`;
  - `mobile/scripts/verify-legal.mjs` (section l6);
  - `mobile/package.json`.

**Interfaces:**
- Consumes:
  - `SAFETY_COPY.reportsPrivacy` and `SAFETY_COPY.blocksPrivacy` (`safetyCopy.ts:85-91`, unchanged);
  - `PRIVACY_ADDRESS`, `LEGAL_URLS`, `LEGAL_COPY` and `openExternal` (Task 1);
  - `useApp().session` (`src/state/AppState.tsx:33`).
- Produces:
  - `dataRequestMailto(accountId: string | null | undefined): string` in `legal.ts`.
    - The result is `mailto:privacy@resbite.com?subject=<enc(subject)>&body=<enc(body)>`.
    - The body is `dataRequestBody`, then a blank line and `dataRequestAccount(id)` only when `id` matches `/^[0-9a-f-]{36}$/i`. `enc` is `encodeURIComponent`.
  - `privacyCopy.ts`:
    - `type PrivacyTopicKey = "account" | "contacts" | "chat" | "connections" | "notifications" | "device" | "vendors" | "retention"`;
    - `PRIVACY_TOPICS: readonly { key: PrivacyTopicKey; title: string; paragraphs: readonly string[] }[]`, exactly as follows (the exact copy is the spec's B5, checked against `docs/legal/privacy-notice.md` sections 3, 7 and 9);
    - `PRIVACY_ABOUT`, below.

    | Key | Title | Paragraphs, in order |
    |---|---|---|
    | `account` | Your account | "Every account needs a mobile number, confirmed with a code we text you. Friends find and invite you by it. We never show your number to other people on Resbite." · "You can also sign in with an email address and password, with Apple or with Google. We keep your name, your photo if you add one, and a record that you’re 18 or over and accepted our Terms of Use." · "Before your photo is uploaded, the app resizes it and removes hidden details, such as where it was taken." · `` `Change your name and photo in Profile. To change the number or email you sign in with, email ${PRIVACY_ADDRESS}.` `` · "You can delete your account at any time with Delete account, below. We finish within 30 days." |
    | `contacts` | Contacts and invitations | "Resbite reads your contacts only when you choose to invite from them, and reads only names and phone numbers. Contact names never leave your phone." · "When you invite people, Resbite checks only the numbers you pick to see who already uses it. Your address book never leaves your phone." (kept, today's `:61-65`) · "If someone you invite isn’t on Resbite, we keep their number for that invitation. We delete it when they answer or you withdraw the invitation, or 30 days after the resbite ends." · "Anyone on Resbite who has your number can see that you’re on Resbite, and can invite you." · "Signing out doesn’t stop links you’ve already shared. Withdraw them from the resbite first if you want them to stop working." |
    | `chat` | Resbites and chat | "Everyone invited to a resbite sees its details, including the exact meeting place, before they answer. Hosts, and guests who answer Going or Maybe, also see the meeting details." · "Anyone with an event’s link can ask to join. A host approves each request." · "Resbite counts how many times an event’s link is opened in the app. It doesn’t record who opened it." · "Chat messages are stored on our servers so everyone in a resbite’s chat can read them, including people who join later. They aren’t end-to-end encrypted." · "If you delete your account, the words of your messages are deleted too." · `SAFETY_COPY.reportsPrivacy` · `SAFETY_COPY.blocksPrivacy` |
    | `connections` | Connections | "When you connect with someone, we keep who asked, the resbite where you met and when. Only the two of you see it." · "If you answer “Not now” or remove a connection, we keep a note of it for 12 months. The other person isn’t told. A request nobody answers is deleted after 90 days." |
    | `notifications` | Notifications | "Notifications are optional. If you turn them on, we keep a push token for your phone." · "Notifications travel through Expo in the United States, then Apple. A chat notification shows the sender’s first name and the first 120 characters of the message." · "To hide what notifications say on your lock screen, go to iPhone Settings → Notifications → Resbite → Show Previews." |
    | `device` | On this device | "The app keeps your sign-in, people lists, invitation links, recent places and messages waiting to send on this phone, in the iOS Keychain." · "Signing out clears almost all of it. A resbite you were creating stays until it’s saved, and an email address waiting to be confirmed stays until you confirm it or choose to forget it." · "Deleting the app may not clear the Keychain. To remove everything, sign out or delete your account first." · "Resbite doesn’t use your location." |
    | `vendors` | Who we work with | "Supabase runs our servers and sign-in, in London. Expo and Apple deliver notifications. Resend sends our emails, and Twilio sends sign-in codes by text. Vercel hosts link.resbite.com." · "We don’t sell your data, show ads or track you, and we use no analytics." |
    | `retention` | How long we keep it | "Your account data stays until you delete your account." · "Past resbites are deleted 12 months after they end. One-off chats are deleted 90 days after they close, and group messages once they’re 12 months old." · "Backups and server logs last 7 days." · "Our Privacy Policy lists every period." |

    `PRIVACY_ABOUT = "This page sums up how Resbite uses your data. Our Privacy Policy has the full details, and you can open it below."`
  - **The page,** in order:
    - `Back` "Profile", the title "Privacy" and the ⓘ "About this page" sheet (now `PRIVACY_ABOUT`).
    - One `RowGroup` with a `TopicRow` per `PRIVACY_TOPICS` entry, each paragraph a `Copy`. The icons are `UserRound`, `Contact`, `MessageCircle`, `Link2`, `Bell`, `Smartphone`, `Server` and `Clock`, with tints from `categoryPalette` (a different one from each neighbour). The Contact topic follows, unchanged (`:138-147`).
    - A `RowGroup`:
      - Privacy Policy (`FileText`, hint `opensInBrowser`) → `openExternal(LEGAL_URLS.privacy)`;
      - Request a copy of my data (`FileDown`, hint `opensEmail(PRIVACY_ADDRESS)`) → `openExternal(dataRequestMailto(session?.user.id))`. When it answers false, it shows `LEGAL_COPY.requestDataFailed(PRIVACY_ADDRESS)` as selectable `Copy` with `accessibilityLiveRegion="polite"` under the group;
      - About and legal (`Landmark`) → `router.push("/about-legal")`.
    - Blocked people (unchanged), then Delete account (unchanged).
  - "Preview & samples" (`:127-137`) and "Resbite is in beta…" (`:170`) are gone.

- [ ] **Step 1: Write the failing tests.**
  - `legal.test.ts` adds `dataRequestMailto`:
    - `dataRequestMailto("11111111-1111-4111-8111-111111111111")` equals `mailto:privacy@resbite.com?subject=Request%20a%20copy%20of%20my%20data&body=Please%20send%20me%20a%20copy%20of%20the%20personal%20data%20Resbite%20holds%20about%20me.%0A%0AMy%20Resbite%20account%20ID%3A%2011111111-1111-4111-8111-111111111111`;
    - `dataRequestMailto(null)`, `dataRequestMailto(undefined)` and `dataRequestMailto("not-an-id")` each equal `mailto:privacy@resbite.com?subject=Request%20a%20copy%20of%20my%20data&body=Please%20send%20me%20a%20copy%20of%20the%20personal%20data%20Resbite%20holds%20about%20me.`.
  - `privacyCopy.test.ts`:
    - the titles, in order, are the eight above, and every paragraph equals the table;
    - the `contacts` topic holds today's lookup line word for word;
    - in `chat`, the end-to-end line comes before `reportsPrivacy`, which comes before `blocksPrivacy`;
    - no paragraph or `PRIVACY_ABOUT` contains any of "stay on this device", "not verified", "draft", "beta", "build", "sample", "Wellness", "Preview actions", "can join it while the link is on" or "Privacy Notice", and none contains `'` (curly apostrophes only). "Preview" alone is allowed: the notifications topic names iPhone's "Show Previews";
    - `PRIVACY_ABOUT` contains "Privacy Policy";
    - every period matched by `/\b\d+ (?:days?|months?|hours?)\b/g` in the topics also appears in `docs/legal/privacy-notice.md` (read from `../../../docs/legal/privacy-notice.md`), so the page never states a period the Privacy Policy doesn't.
  - `supportContact.test.ts`: the test at `:75-88` becomes "Data & privacy draws its topics from PRIVACY_TOPICS, and the chat topic keeps what a report keeps and how long blocks stay". It asserts that `data-privacy.tsx` contains `PRIVACY_TOPICS.map(` and that the `chat` topic's last two paragraphs are `SAFETY_COPY.reportsPrivacy` and `SAFETY_COPY.blocksPrivacy`. The Blocked people test (`:90-101`) stays as it is and must still pass.
- [ ] **Step 2: Run them to see them fail:** `node --import tsx src/domain/legal.test.ts && node --import tsx src/domain/privacyCopy.test.ts && node --import tsx src/domain/supportContact.test.ts` → FAIL.
- [ ] **Step 3: Implement** `dataRequestMailto`, `privacyCopy.ts` and the page. Append `privacyCopy.test.ts` to the chain.
- [ ] **Step 4: Update the browser checks.**
  - `verify-deletion.mjs`:
    - `CHAT_CORE` (`:37-38`) becomes the new end-to-end line;
    - "On this device" expects `/^The app keeps your sign-in, people lists/`;
    - the About sheet expects `PRIVACY_ABOUT` exactly (the old line at `:240-243` was already stale: "Resbite is in private development.");
    - "Chat messages" becomes "Resbites and chat";
    - `lastTopic` becomes `"How long we keep it"` when there is no address;
    - the gap check (`:270-277`) compares `gapBetween(button(page, lastTopic), button(page, "Privacy Policy"))` with `gapBetween(blockedRow, button(page, "Delete account"))`.
  - `review-ui.mjs`:
    - in `:140-159`, "Chat messages" becomes "Resbites and chat" with the new end-to-end line;
    - delete `:160-166` (Preview & samples);
    - keep `:135` ("On this device" exists).
  - `verify-legal.mjs` (l6), by preview: "Preview the design", then the Profile tab, then Data & privacy.
    - The topic buttons appear in the table's order, with no "Preview & samples" and no text matching `/beta/i`.
    - About this page shows `PRIVACY_ABOUT`.
    - Privacy Policy records PRIVACY.
    - Request a copy of my data records the no-id `mailto:` above (preview has no session).
    - About and legal opens its heading.
    - At 320 px under Larger Text, the page fits and nothing is clipped.
- [ ] **Step 5: Run** `npm run check` → PASS. Then run `node scripts/verify-legal.mjs`, `node scripts/verify-deletion.mjs` (and again with `EXPECT_SUPPORT=help@x.example` after restarting Expo with the address) and `node scripts/review-ui.mjs` → PASS.
- [ ] **Step 6: Commit.**

```bash
git add mobile/src/domain/privacyCopy.ts mobile/src/domain/privacyCopy.test.ts mobile/src/domain/legal.ts mobile/src/domain/legal.test.ts mobile/app/data-privacy.tsx mobile/src/domain/supportContact.test.ts mobile/scripts/verify-deletion.mjs mobile/scripts/review-ui.mjs mobile/scripts/verify-legal.mjs mobile/package.json
git commit -m "App Store readiness: Data & privacy matches the Privacy Policy, with Request a copy of my data"
```

### Task 7: No sample, beta or test wording (B4, CON-1, CON-2)

**Files:**
- Create: `mobile/src/domain/releaseWording.test.ts`
- Delete: `mobile/app/(tabs)/wellness.tsx`
- Modify:
  - `mobile/app/(tabs)/_layout.tsx:46-52`;
  - `mobile/app/(tabs)/_layout.web.tsx:3,37`;
  - `mobile/src/domain/accountCopy.ts:1,55-68` and `accountCopy.test.ts:8,12,49-74,101-114`;
  - `mobile/src/services/rsvp.ts:77` and `src/domain/circle.test.ts:99`;
  - `mobile/src/domain/notifications.ts:19-21,40` and `notifications.test.ts:222-231`;
  - `mobile/src/services/pushDevice.ts:109`;
  - `mobile/src/domain/phoneCopy.ts:38` and `src/services/phoneFold.test.ts:52`;
  - `mobile/app/activity/[id].tsx:83`;
  - `mobile/app/auth/index.tsx:257-259`;
  - `mobile/scripts/verify-planning.mjs:378-388,393`;
  - `mobile/scripts/review-ui.mjs:122-124,251,280-282`;
  - `mobile/scripts/verify-notifications.mjs:52-58`;
  - `mobile/scripts/verify-contact-invites.mjs:693`;
  - `mobile/scripts/verify-legal.mjs` (section l7);
  - `mobile/package.json`.

**Interfaces:**
- Consumes: the `typescript` package (already a devDependency; `nativeImports.test.ts:5` imports it).
- Produces, as exact copy:
  - `UNNAMED_GUEST = "Guest"`.
  - `notificationDelivery.label = "Updates are off"`.
  - `notificationDelivery.detail = "Resbite isn’t sending you updates about plans and answers. Open My resbites for the latest details and answers."`.
  - `UPDATES_NOT_ACTIVE = "Updates are off."`.
  - The project-id error is `"Notifications can’t be set up on this phone."`.
  - `PHONE_COPY.foldOff = "Bringing an invitation into this account isn’t available right now."`.
  - About access (`auth/index.tsx:258`) reads `"Resbite is for people aged 18 and over. Every account needs a mobile number, confirmed with a code we text you."`.
  - The preview-only line at `activity/[id].tsx:83` is deleted.
  - `wellnessSample`, `formatMinutes` and the `CategoryKey` import go from `accountCopy.ts`, and the Wellness test goes from `accountCopy.test.ts`.
  - `releaseWording.test.ts` collects the user-facing text of every non-test `.ts` and `.tsx` file under `app/` and `src/`.
    - It walks the AST from `ts.createSourceFile(…, ts.ScriptTarget.Latest, true, TSX or TS)` and collects `StringLiteral`, `NoSubstitutionTemplateLiteral`, `TemplateHead`, `TemplateMiddle`, `TemplateTail` and `JsxText`. Comments are never scanned.
    - It asserts that none matches `/\bbeta\b/i`, `/development build/i`, `/\bthis build\b/i`, `/private test/i`, `/in private testing/i`, `/switched on yet/i`, `/aren’t active yet/i`, `/sample data/i`, `/example numbers/i` or `/Preview & samples/`, and that no string literal is exactly `"Tester"`.
    - The only exceptions are plan 2's `app/delete-account.tsx`, `src/services/accountDeletion.ts` and `src/services/accountDeletionFlow.ts`. They sit in one named array, `B3_REWRITES`, with the comment "Plan 2 (B3) rewrites these; remove each when it does". If plan 2's Task 8 has already merged (`grep -c DELETION_COPY mobile/app/delete-account.tsx` prints more than 0), the array starts empty.
    - It also asserts that `app/(tabs)/wellness.tsx` doesn't exist, and that neither tabs layout names `wellness`.

- [ ] **Step 1: Write the failing tests.**
  - Write `releaseWording.test.ts`.
  - Change the expectations that the copy changes:
    - `circle.test.ts:99` expects `"Guest"`;
    - `notifications.test.ts:223` expects `"Reminders can reach you. Updates are off."`, and `:231` checks `!…includes("Updates are off")`;
    - `accountCopy.test.ts:49-74`: the test is renamed "UX3 notifications wording: reminders use the permission, and updates say they are off", each `Updates aren’t active yet.` becomes `Updates are off.`, and the Wellness test (`:101-114`) and its imports (`:8`, `:12`) are removed;
    - `phoneFold.test.ts:52` expects the new `foldOff`.
- [ ] **Step 2: Run them to see them fail:** `node --import tsx src/domain/releaseWording.test.ts` → FAIL. It lists each match with its file, for example `src/services/rsvp.ts: "Tester"`, `app/data-privacy.tsx`… (none after Task 6), `src/domain/notifications.ts: This build does not send…`.
- [ ] **Step 3: Implement** each change.
  - Delete the Wellness route, its `NativeTabs.Trigger`, the web `Tabs.Screen` and the `Leaf` import.
  - Append `releaseWording.test.ts` to the chain.
- [ ] **Step 4: Update the browser checks.**
  - `verify-planning.mjs:378-388`: replace the Wellness block with `await expect(page.getByRole("tab", { name: "Wellness", exact: true })).toHaveCount(0);`. Its PASS line (`:393`) reads "…and no Wellness tab; the Profile tab."
  - `review-ui.mjs`: delete `:122-124` and `:281-282`, and drop "and Wellness" from `:251`.
  - `verify-notifications.mjs:56`: the new `notificationDelivery.detail`.
  - `verify-contact-invites.mjs:693`: the new `foldOff`.
  - `verify-legal.mjs` (l7):
    - in preview, the tab bar's tabs are exactly Create, My resbites and Profile;
    - `${base}/wellness` does not show a "Wellness" heading;
    - `/auth?mode=login` → About access shows the new line, and no text matches `/private|test/i` in the sheet.
- [ ] **Step 5: Run** `npm run check` → PASS. Then run `node scripts/verify-legal.mjs`, `verify-planning.mjs`, `review-ui.mjs`, `verify-notifications.mjs` and `verify-contact-invites.mjs` → PASS.
- [ ] **Step 6: Commit.**

```bash
git add -A "mobile/app/(tabs)" mobile/src/domain/releaseWording.test.ts mobile/src/domain/accountCopy.ts mobile/src/domain/accountCopy.test.ts mobile/src/services/rsvp.ts mobile/src/domain/circle.test.ts mobile/src/domain/notifications.ts mobile/src/domain/notifications.test.ts mobile/src/services/pushDevice.ts mobile/src/domain/phoneCopy.ts mobile/src/services/phoneFold.test.ts "mobile/app/activity/[id].tsx" mobile/app/auth/index.tsx mobile/scripts mobile/package.json
git commit -m "App Store readiness: no Wellness samples, beta, build or tester wording in the app"
```

### Task 8: The dead sign-up code (B11, app half: dead code only)

**Files:**
- Create: `mobile/src/domain/authScreens.test.ts` (extended in Task 9)
- Modify: `mobile/app/auth/index.tsx:8,11,40,61-90,93-108,114-136,137,154,162,177-181,223,247`; `mobile/src/state/useAuthFlow.ts:6,15,29-30,51,138-162,179,221,286`; `mobile/package.json`

**Interfaces:**
- Consumes: the `register` redirect, kept (`auth/index.tsx:49-50`); `authTitle(mode, step, confirmedEmail)`, unchanged (`src/domain/accountCopy.ts:13`).
- Produces:
  - `useAuthFlow()` no longer returns `step`, `setStep`, `details` or `setDetails`. `submit()` has no register branch: it handles login, reset and confirm only, and never calls `supabase.auth.signUp` or `registrationMetadata`. `switchMode` no longer resets a step.
  - The scroll effect's dependencies are `[confirmedEmail, mode]`.
  - `auth/index.tsx` keeps `if (register) return <Redirect href="/auth/phone" />`.
    - Everything after the redirect drops its `register` branches. Concretely: `step={null}` with no `total`, no `onBack`, the Sign in title in login mode, `disabled={restoring || ((mode === "reset" || mode === "confirm") && remaining > 0)}`, no register status, the fields when `!confirmedEmail`, the password field in login mode with `autoComplete="current-password"`, no password hint, Apple and Google in login mode, and "I have an account" in confirm mode.
    - It calls `authTitle(mode, 0, confirmedEmail)`.
  - `registration.ts`, `RegistrationDetails.tsx` and `account-details.tsx` are untouched. They belong to the B11 plan, which removes the fields.

- [ ] **Step 1: Write the failing source test** `authScreens.test.ts`, which reads both files as text (as `supportContact.test.ts:48-49` does).
  - `auth/index.tsx` contains `<Redirect href="/auth/phone" />` and none of `RegistrationDetails`, `skipOptionalDetails`, `setDetails`, `setStep` or `step + 1`.
  - `useAuthFlow.ts` contains none of `signUp(`, `registrationMetadata`, `validateSignupStep`, `validateDetails`, `emptyRegistration` or `validateRegistration`.
- [ ] **Step 2: Run it to see it fail:** `node --import tsx src/domain/authScreens.test.ts` → FAIL.
- [ ] **Step 3: Implement** the removals, and append the test to the chain.
- [ ] **Step 4: Run** `npm run check` → PASS (typecheck catches any leftover use). Then run `node scripts/verify-auth.mjs`, `node scripts/verify-registration.mjs` and `node scripts/verify-confirmation.mjs` → PASS: login, reset, confirm, and the old register address opening phone sign-up all behave as before.
- [ ] **Step 5: Commit.**

```bash
git add mobile/app/auth/index.tsx mobile/src/state/useAuthFlow.ts mobile/src/domain/authScreens.test.ts mobile/package.json
git commit -m "App Store readiness: remove the dead email sign-up and its optional details"
```

### Task 9: Apple's own button and the number explanation (B9, B10)

**Files:**
- Create: `mobile/src/design/AppleButton.tsx`
- Modify: `mobile/app/auth/index.tsx:9,225`; `mobile/app/auth/phone.tsx:6,125`; `mobile/app/about-you.tsx:8,103-113`; `mobile/src/domain/phoneCopy.ts:29-30`; `mobile/app/add-phone.tsx:58`; `mobile/src/domain/authScreens.test.ts`; `mobile/scripts/verify-phone.mjs:356-410`

**Interfaces:**
- Consumes: `expo-apple-authentication`'s `AppleAuthenticationButton`, `AppleAuthenticationButtonType.CONTINUE` and `AppleAuthenticationButtonStyle.BLACK` (`node_modules/expo-apple-authentication/build/AppleAuthentication.types.d.ts:11-25,232-262`), lazily required as in `src/services/appleSignIn.ts:61`; `appleSignInAvailable()` (`:81-86`, unchanged).
- Produces:
  - `AppleButton({ onPress, disabled = false, hint }: { onPress: () => void; disabled?: boolean; hint?: string })` in `src/design/AppleButton.tsx`.
    - It renders `AppleAuthenticationButton` with `buttonType={CONTINUE}`, `buttonStyle={BLACK}`, `cornerRadius={22}`, `style={{ height: 44, width: "100%" }}` and `accessibilityHint={hint}`.
    - It sits inside a `View` with `pointerEvents={disabled ? "none" : "auto"}` and `accessibilityState={{ disabled }}`. It sets no background, radius or opacity: Apple's rules.
    - It is rendered only where `appleAvailable` is true (iOS), as the chips are today.
  - Where it replaces the Apple `Chip`:
    - `auth/index.tsx:225` → `<AppleButton onPress={apple} disabled={blocked} />`;
    - `auth/phone.tsx:125` → `<AppleButton onPress={apple} />`;
    - `about-you.tsx:104-112` → `<AppleButton hint={PHONE_COPY.appleNameHint} disabled={busy} onPress={() => void link(() => linkApple(appleLinkDeps))} />`, placed before the chips row so the Google chip keeps its row.
    - The three `AppleMark` imports go. `src/design/AppleMark.tsx` stays for `delete-account.tsx` (plan 2).
  - `PHONE_COPY.addPrivacy = "We never show your number to other people on Resbite."`. `add-phone.tsx` shows it as a second `Copy` right after `addBody` (`:58`). `addBody` stays word for word.

- [ ] **Step 1: Write the failing tests.**
  - `authScreens.test.ts`:
    - `auth/index.tsx`, `auth/phone.tsx` and `about-you.tsx` each contain `<AppleButton` and neither `AppleMark` nor the text `GUEST_COPY.apple}` or `"Continue with Apple"` as a `Chip` text;
    - `AppleButton.tsx` contains `AppleAuthenticationButtonType.CONTINUE`, `AppleAuthenticationButtonStyle.BLACK`, `cornerRadius={22}` and `height: 44`, and no `backgroundColor` or `borderRadius`;
    - `PHONE_COPY.addBody === "Your friends find and invite you by your number."` and `PHONE_COPY.addPrivacy === "We never show your number to other people on Resbite."`.
  - `verify-phone.mjs`, section 3 (`:356-410`):
    - after the line check at `:377`, also expect `We never show your number to other people on Resbite.`;
    - add section 3d, which runs the `phoneless()` fixture twice with `app_metadata: { provider: "apple", providers: ["apple"] }` and then `{ provider: "google", providers: ["google"] }`. Each lands on "Add your number" at `/add-phone` with both lines visible (B10).
- [ ] **Step 2: Run them to see them fail:** `node --import tsx src/domain/authScreens.test.ts` → FAIL. `node scripts/verify-phone.mjs` → FAIL (the second line is missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check` → PASS. `node scripts/verify-phone.mjs` and `node scripts/verify-auth.mjs` → PASS (web shows no Apple button, as `verify-auth.mjs:42-51` expects).
- [ ] **Step 5: Commit.**

```bash
git add mobile/src/design/AppleButton.tsx mobile/app/auth/index.tsx mobile/app/auth/phone.tsx mobile/app/about-you.tsx mobile/src/domain/phoneCopy.ts mobile/app/add-phone.tsx mobile/src/domain/authScreens.test.ts mobile/scripts/verify-phone.mjs
git commit -m "App Store readiness: Apple's own Continue with Apple button, and why every account needs a number"
```

### Task 10: Version 1.0.0 and the privacy manifest (B13, CON-8, PRV-16)

**Files:**
- Modify: `mobile/app.json:6,10-19`; `mobile/src/domain/appConfig.test.ts`

**Interfaces:**
- Consumes:
  - the `PrivacyInfo.xcprivacy` files of the installed SDKs, found by walking `node_modules`. The walk skips directories named `android`, `.bin`, `__tests__` and `.cache`. At `app-store-readiness` (`83d75eb`) they declare:
    - FileTimestamp C617.1, 0A2A.1 and 3B52.1;
    - DiskSpace E174.1 and 85F4.1;
    - UserDefaults CA92.1;
    - SystemBootTime 35F9.1;
  - section 6 of `qa/app-store-release/app-store-connect-pack.md` (the table under "## 6. App Privacy answers").
- Produces, in `app.json`:
  - `"version": "1.0.0"`.
  - Under `ios`, `privacyManifests`:
    - `NSPrivacyTracking: false` and `NSPrivacyTrackingDomains: []`;
    - `NSPrivacyCollectedDataTypes`: one entry for each of `NSPrivacyCollectedDataTypeName`, `…EmailAddress`, `…PhoneNumber`, `…Contacts`, `…EmailsOrTextMessages`, `…PhotosorVideos`, `…CustomerSupport`, `…OtherUserContent`, `…UserID`, `…DeviceID`, `…ProductInteraction` and `…OtherDataTypes`, in that order. Each has `NSPrivacyCollectedDataTypeLinked: true`, `NSPrivacyCollectedDataTypeTracking: false` and `NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]`;
    - `NSPrivacyAccessedAPITypes`, in this order:
      - `{ NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["C617.1", "0A2A.1", "3B52.1"] }`;
      - `{ …UserDefaults, ["CA92.1"] }`;
      - `{ …DiskSpace, ["E174.1", "85F4.1"] }`;
      - `{ …SystemBootTime, ["35F9.1"] }`.
  - The pack's data-type names map to the constants as follows: Name → Name, Email Address → EmailAddress, Phone Number → PhoneNumber, Contacts → Contacts, Emails or Text Messages → EmailsOrTextMessages, Photos or Videos → PhotosorVideos, Customer Support → CustomerSupport, Other User Content → OtherUserContent, User ID → UserID, Device ID → DeviceID, Product Interaction → ProductInteraction, Other Data Types → OtherDataTypes.

- [ ] **Step 1: Write the failing tests** in `appConfig.test.ts`.
  - The version is `"1.0.0"` (CON-8).
  - `NSPrivacyTracking === false` and `NSPrivacyTrackingDomains` is `[]`.
  - Every collected type is linked, not tracking, and used only for App Functionality.
  - **The pack (Review Focus 3):**
    - parse each `|` row of the section 6 table, up to the next `## `, whose third cell contains `**Yes**`;
    - map its second cell through the table above;
    - the set equals the manifest's set of `NSPrivacyCollectedDataType`;
    - an unmapped Yes name fails with "add <name> to the mapping and the manifest".
  - **The SDKs:** every (category, reason) pair any found `PrivacyInfo.xcprivacy` declares appears in `NSPrivacyAccessedAPITypes`.
    - Extract the pairs with `/<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>([\s\S]*?)<\/array>/g` and the reasons with `/<string>([^<]+)<\/string>/g`.
    - Assert that at least 8 manifests were found, so a broken walk can't pass vacuously.
  - No SDK manifest sets `NSPrivacyTracking` to true (`<key>NSPrivacyTracking</key>\s*<true/>`). If one ever does, the app would be tracking, and nothing plans an App Tracking Transparency prompt.
- [ ] **Step 2: Run it to see it fail:** `node --import tsx src/domain/appConfig.test.ts` → FAIL.
- [ ] **Step 3: Implement** the `app.json` changes.
- [ ] **Step 4: Run** `npm run check` → PASS. Then `npx expo config --type public --json` → the output contains `"version": "1.0.0"` and `privacyManifests`. Then `npx expo prebuild --platform ios --no-install --clean` in a throwaway copy:
  - copy `mobile/` without `node_modules` into a new `mktemp -d` directory and symlink `mobile/node_modules` into it;
  - `ios/Resbite/PrivacyInfo.xcprivacy` exists and holds `NSPrivacyAccessedAPICategorySystemBootTime`;
  - `ios/Resbite/Info.plist` has no `NSLocationWhenInUseUsageDescription` and no `NSMotionUsageDescription`;
  - its `NSContactsUsageDescription` is the Task 3 string.
  - Delete the copy. Never commit `ios/`.
- [ ] **Step 5: Commit.**

```bash
git add mobile/app.json mobile/src/domain/appConfig.test.ts
git commit -m "App Store readiness: version 1.0.0 and a privacy manifest that matches the App Privacy answers"
```

### Task 11: Records and the full run

**Files:**
- Modify:
  - `mobile/README.md`: `:16` loses "Sample wellness data is labelled in every build." After the `npm run check` line (`:12`) it lists `npm run check:release`, `node --import tsx scripts/generate-licences.mjs` (run after any dependency change, then commit `src/domain/licences.json`) and `node scripts/verify-legal.mjs`.
  - `docs/implementation-status.md`: after the "Open beta" paragraph (`:3`), a paragraph "**App Store readiness, app plan 3, <date>:**" with what is built on `asr-3-app-legal`, that nothing is released, and the owner steps below.
  - `qa/app-store-release/README.md`:
    - the EAS table's `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` rows read "Optional. Unset, the app uses https://link.resbite.com/terms and /privacy; set only if the pages move (an https link)";
    - step 20 gains "The build log shows `PASS release check: …` from the `eas-build-post-install` hook";
    - the Legal and contact checks gain "Community rules opens `/terms#community-rules`".
  - `knowledge-base/08-decisions.md`: at the end of the AS section, "*Plan 3 (app legal and content), <date>:*" and one line for each of Decisions 1 to 10 above, each "AS-P3-<n>".

**Interfaces:** none.

- [ ] **Step 1: Run every check from a clean start.**
  - `cd mobile && npm ci && npm run check` → PASS.
  - Restart Expo with `--clear`, then run `node scripts/verify-legal.mjs`, `verify-auth.mjs`, `verify-registration.mjs`, `verify-confirmation.mjs`, `verify-phone.mjs`, `verify-people.mjs`, `verify-deletion.mjs`, `verify-planning.mjs`, `verify-notifications.mjs`, `verify-contact-invites.mjs` and `review-ui.mjs` → each PASS.
  - Run the support-address runs (`EXPECT_SUPPORT=help@x.example`) of `verify-legal.mjs` and `verify-deletion.mjs` → PASS.
  - Run the override run of `verify-legal.mjs` → PASS.
  - `cd links && node --test` → PASS (no link-site change; `personal-flow.test.mjs:162` still holds).
- [ ] **Step 2: Grep for leftovers.**
  - `grep -rn "Privacy Notice" mobile/app mobile/src` → nothing.
  - `grep -rn "expo-location\|async-storage" mobile/app mobile/src mobile/app.json mobile/package.json` → nothing.
- [ ] **Step 3: Write the records** above.
- [ ] **Step 4: Commit and push.**

```bash
git add mobile/README.md docs/implementation-status.md qa/app-store-release/README.md knowledge-base/08-decisions.md
git commit -m "App Store readiness: records for the app's legal links, licences and content clean-up"
git push -u origin asr-3-app-legal
```

---

## Rollout (owner-run)

This plan has **no migration, no Edge Function and no hosted Supabase step**, so there is no sha256 to approve. Each step below needs the owner's explicit approval at the time. Record each in `qa/app-store-release/README.md` under "Applied", with no values, names, numbers or ids.

This plan creates two scripts. Neither touches a hosted service:
- `mobile/scripts/check-release.mjs`. It runs inside the EAS production build, as the `eas-build-post-install` hook, and the owner can run it with `npm run check:release`. Never feed it values through a `mobile/.env.local` file.
- `mobile/scripts/generate-licences.mjs`. Run it locally after any dependency change, then commit the JSON.

| # | Step | Approval | Where it is recorded |
|---|---|---|---|
| R1 | **EAS production variables:** `EXPO_PUBLIC_SUPPORT_ADDRESS` = the support inbox (support@resbite.com, plain-text visibility, once the inbox exists: F1) and `EXPO_PUBLIC_PUSH_ENABLED` = `true`; `EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED` = `true` is set by plan 2's Rollout step 8, after its deletion release is live. Leave `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` unset unless the pages move. Check with `npx eas env:list --environment production`, recording set or unset only. | EAS | Runbook step 19 |
| R2 | **The pages are live:** the owner opens https://link.resbite.com/privacy, /terms (with "Community rules" at `#community-rules`) and /support in Safari. D1, a separate plan and a Vercel approval, publishes them. The assistant does not fetch the product domain (gap analysis ASC-1). | Vercel (D1) | Runbook step 16 |
| R3 | **Production build** at the merged commit: `npx eas build --platform ios --profile production`. The build log shows `PASS release check: support address set, push on, deletion on, …`. If it shows `Release check failed:`, fix the variables (R1) and build again; never remove the hook to get past it. Then `npx eas submit`, and read Apple's upload email for ITMS-91053 (missing reasons) or ITMS-91061 (missing SDK manifest). | EAS, TestFlight | Runbook step 20 |
| R4 | **Xcode privacy report:** archive the same commit on the Mac, then Organizer → Generate Privacy Report. It lists the app's manifest (the twelve data types, the four API categories) and Hermes. | — (Mac) | Runbook step 22 |
| R5 | **Device checks on the TestFlight build:** version 1.0.0; the welcome, phone sign-in and email sign-in links open the live pages; About and legal opens Privacy Policy, Terms of Use, Community rules and Support, and shows the company details; Licences lists the fonts and packages; Data & privacy's topics read as in Task 6; "Request a copy of my data" opens Mail to privacy@resbite.com with the subject, body and account ID; no Wellness tab; no location prompt, and Settings → Resbite lists no Location; the contacts prompt reads Task 3's string; Apple's black "Continue with Apple" button works and is no smaller than the Google chip; after Apple or Google sign-up, Add your number shows both lines; VoiceOver reads each legal link as a link. | — (device) | Runbook step 22 |
| R6 | **App Privacy answers** entered exactly as the pack's section 6, which Task 10's test keeps equal to the manifest. | App Store Connect | Runbook step 24 |

## Open points

1. **AS-R2: settled by the cross-plan review (17 November 2026).** The documents now follow AS-R2 (`docs/legal/privacy-notice.md` sections 3.9, 7 and 8; `docs/legal/delete-account.md`, "Reports you made"): a report filed by someone who deletes their account is kept until it is closed, then 180 days, without their account. Plan 2 builds it and rewrites `SAFETY_COPY.reportsPrivacy` to say so (its Task 8). This plan shows `reportsPrivacy` by reference, so Task 6's tests need no change; the period test finds "180 days" in the Privacy Policy.
2. **Native libraries' licence texts.** React Native compiles in Boost, Folly, glog, fmt, DoubleConversion and fast_float. Task 4 lists them with their licence names only, because their texts are not in `node_modules`. Whether BSD-style terms need the full texts in the app for a binary build, or whether React Native's prebuilt dependencies already carry them, is UNVERIFIED. If texts are needed, add a small committed folder of them and extend `buildLicences`.
3. **The EAS hook's behaviour is UNVERIFIED in Expo's docs:**
   - whether a failing `eas-build-post-install` stops the build;
   - whether production builds install devDependencies (`tsx`).
   R3 settles both on the first production build's log. If `tsx` is missing, change the hook to Node's type stripping or move `tsx` to `dependencies`.
4. **Apple's privacy-manifest constant spellings** (for example `NSPrivacyCollectedDataTypePhotosorVideos`) come from the pack and Apple's documentation, whose page renders only with JavaScript and was not read here. R3's upload email and R4's report confirm them.
5. **Profile has no direct legal row.** The spec allowed Profile or Data & privacy, and this plan follows the documents (Decision 1). If the owner wants one, add a Profile row that opens `/about-legal`, and change the review notes' path.
6. **"Not active yet"** (the Updates chip) and **"Recommendations … are not active yet"** (`src/design/RegistrationDetails.tsx:37`, removed by the B11 plan) are left as they are. Task 7's scan does not match them.
