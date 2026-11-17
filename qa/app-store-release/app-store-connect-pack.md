# App Store Connect pack: Resbite 1.0

- **Owner:** the owner.
- **Version:** 1.0 (draft).
- **Date:** 17 November 2026.
- **Next review:** before the 1.0 submission (phase 6, step 24 of the [release runbook](README.md)); then at every release, and at least every six months (next by 17 May 2027).
- **Purpose:** every App Store Connect field for Resbite's first public release, with the exact answer for 1.0 and the reason for it.
- **Review:** a draft for the owner. The listing copy, the age rating answers and the App Privacy answers must match the Privacy Notice (A1) and the Terms of Use (A3), which go to a UK solicitor before publishing (decision D-12). Send this pack with them, so the solicitor sees what Apple and the public will be told.
- **Gap analysis:** `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`, workstream E (E1 to E12) and rows ASC-1 to ASC-18, SI-2, SI-5, PRV-14, PRV-20.
- **Public drafts this pack must match:** `docs/legal/privacy-notice.md` (A1), `docs/legal/terms-of-use.md` (A3), `docs/legal/support.md` (A4) and `docs/legal/delete-account.md` (A6), drafted alongside this pack.

**Target state.** The answers describe Resbite as it will be at 1.0, once workstreams B, C and D are built with the gap analysis' recommended default for every owner decision. Each answer that is only true once something is built names the item (for example "B11"). Check each one against the submission build before you enter it. Where the code and the gap analysis disagree, this pack follows the code and says so.

## Placeholders to fill

| # | Placeholder | Where |
|---|---|---|
| 1 | [[OWNER: approve the app name — proposed: "Resbite"]] | Section 1 |
| 2 | [[OWNER: approve the subtitle — proposed: "Small plans with your people"]] | Section 1 |
| 3 | [[OWNER: approve the promotional text, description and keywords — proposed: text in section 3]] | Section 3 |
| 4 | [[OWNER: Marketing URL — proposed: leave it empty for 1.0, or https://www.resbite.com once the F18 check passes]] | Section 4 |
| 5 | [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]] | Sections 6 and 10 |
| 6 | [[OWNER: SMS provider — proposed: Twilio]] | Section 10 (in the review notes) |
| 7 | [[OWNER: App Review contact name, email and +44 phone — proposed: the owner, with support@resbite.com as the email, typed only into App Store Connect, never into the repo]] | Section 10 |
| 8 | [[OWNER: review account email and password — proposed: account R1 of the pack's section 12, typed only into App Store Connect's Sign-In Information, never into the repo]] | Section 10 (account R1 of section 12) |
| 9 | [[OWNER: deletion-test account email and password — proposed: account R2 of the pack's section 12, typed only into the Notes in App Store Connect, never into the repo]] | Section 10 (account R2 of section 12) |
| 10 | [[OWNER: three mobile numbers the owner controls, none already on a Resbite account — proposed: one per review account, verified once by text and never written in the repo]] | Section 12 |
| 11 | [[OWNER: titles of the two seeded resbites — proposed: "Thursday board games" and "Picnic in the park"]] | Section 12 |
| 12 | [[OWNER: devices and iOS versions tested — proposed: each iPhone model and iOS version from the runbook's device checks, and the iPad used in iPhone compatibility mode]] | Section 10 (in the review notes) |
| 13 | [[OWNER: the backup moderator's identity — recorded only in the signed team access agreement kept outside the repo; the repo records only that a backup is named, and the date — proposed: one named person at the Supabase Developer role with MFA, named before the 1.0 submission]] | Section 12 |

The SKU is not a placeholder: it was fixed when the app record was created for TestFlight, and Apple does not let it change. Copy it into the runbook's release record.

## How to use this pack

- Enter the answers in phase 6 of the [release runbook](README.md), after the submission build has passed the device checks. Entering them and submitting each need the owner's approval at the time.
- **Never put personal data in this file.** Sign-in details, the review contact and phone numbers go into App Store Connect only.
- Each field below gives the App Store Connect page it sits on, the answer, and why.
- If the build differs from what an answer assumes, change the answer to match the build, not the other way round, and note it in the runbook's "Applied" section.

---

## 1. App Information page

App Store Connect → Apps → Resbite → General → App Information.

| Field | Answer for 1.0 | Why, and limits |
|---|---|---|
| Name | **Resbite** [[OWNER: approve the app name — proposed: "Resbite"]] | 2 to 30 characters. Matches the name under the icon (`mobile/app.json:3`). Editable until submission. |
| Subtitle | **Small plans with your people** (28 characters) [[OWNER: approve the subtitle — proposed: "Small plans with your people"]] | Up to 30 characters. It echoes the welcome screen's line "Small plans with your people." (`mobile/app/index.tsx`). No pricing words and no other app's name (guideline 2.3.7). An alternative within the limit: "Get-togethers with friends" (26). |
| Primary language | **English (U.K.)** | Matches the UK-only release (D-2). |
| Bundle ID | **com.resbite.app** | Already in use for TestFlight (`mobile/app.json:12`). It cannot change after a build is uploaded. |
| SKU | **Already set** | Fixed when the app record was made. Copy it into the release record. |
| Primary category | **Social Networking** | D-18. Resbite's core is planning with friends, invitations and chat. |
| Secondary category | **Lifestyle** | D-18. |
| Content Rights | **Yes**: the app contains, shows or accesses third-party content, and we have the rights we need. See section 8. | |
| Age Rating | **18+**, by override. See section 5. | Required. |
| License Agreement | **Apple's standard EULA** (no custom licence) | ASC-12. Our own rules for user content are in the Terms of Use (A3), which every account accepts in the app (B2) and which the description links. |
| Regulated medical device | **Not asked.** If it is, answer **No**. | Apple asks only apps in the Health & Fitness or Medical category, or with frequent medical content. Resbite is neither. |
| App Compliance → Digital Services Act | **Not a trader** while the app is on the UK storefront only. See section 9. | |

## 2. Pricing and Availability page

| Field | Answer for 1.0 | Why |
|---|---|---|
| Base country or region | **United Kingdom** | D-2. |
| Price | **Free (0.00 GBP)** | Free at launch, with no in-app purchases, subscriptions or ads. |
| Availability | **United Kingdom only.** Untick every other country or region. | D-2. A UK-only 1.0 keeps the EU pack (A21), the EU trader details and the Australian, Brazilian, Singaporean and US age laws out of scope (ASC-14). |
| Pre-orders | **No** | |
| iPhone and iPad apps on Apple silicon Macs | **Off** | The app has not been tested on a Mac (contacts, Sign in with Apple and push there are untested). Check the current wording on the page. |
| Apple Vision Pro | **Off** | Not tested. Check the current wording on the page. |
| Agreements (Business) | Check that Business → Agreements shows the free-apps agreement as active. **No Paid Applications agreement** is needed for 1.0. | Free, no purchases. If paid features come in a later version, the Paid Applications agreement, tax and banking come first. |

## 3. Version page: listing copy

App Store Connect → iOS App → 1.0.0. The owner approves the final copy: [[OWNER: approve the promotional text, description and keywords — proposed: text in section 3]].

Rules checked on 17 November 2026: promotional text up to 170 characters; description up to 4,000 characters, plain text; keywords up to 100 bytes, each keyword over two characters, no other app or company names, and no repeating the app or company name. Guideline 2.3.7 bars pricing information, other apps' names, trademarked terms and irrelevant phrases, so the copy below never says "free" and names no other app. Guideline 2.3.10 bars the names of other mobile platforms.

### 3.1 Promotional text (168 characters)

```text
Plan a coffee, a walk or a weekly games night in a minute. Invite friends by their number, see who's going and chat with everyone in one place. For adults, with no ads.
```

### 3.2 Description (2,305 characters)

```text
Resbite makes it easy to get together with your people. Plan a coffee, a walk, a picnic or a weekly games night, invite friends by their phone number, and see who's coming, all in one place.

PLAN IN A MINUTE
Start from an idea or make your own. Pick a time and a place, add a cover photo, a description and a note for your guests. Keep private details, such as a door code, for the guests who say Going or Maybe.

INVITE THE PEOPLE YOU MEAN
Pick friends from your contacts one by one, or type a number. Each person gets a personal invitation link that you send from your own messaging app, so they hear it from you. Friends can answer on the web without installing anything, and friends already on Resbite get the invitation in the app. You can also share an event link and approve each person who asks to join.

SEE WHO'S GOING
Guests answer Going, Maybe or Can't go. You see the answers at a glance, can make a guest an admin to help you run it, and can let guests you trust bring someone along.

CHAT WITH EVERYONE ON THE RESBITE
Every resbite has its own chat, and hosts can post announcements that everyone sees. Notifications tell you when someone answers, writes or changes the plan. You can mute any chat or resbite.

WEEKLY GROUPS
Make a resbite repeat every week or every two weeks. Resbite sets up the next one for you, and the group keeps one chat that stays open.

STAY CONNECTED
Connect with people you met at a resbite, so you can invite each other next time. There is no public search: you can only connect with people who shared a resbite with you.

ON YOUR CALENDAR
Add a resbite to your calendar, and get a reminder the day before and an hour before it starts.

SAFE AND PRIVATE
- Resbite is for adults aged 18 and over.
- Everyone agrees to the chat rules. A filter stops abusive words, and you can report or block someone wherever you meet them. Our team reads every report.
- No ads and no tracking.
- Resbite checks only the contact numbers you pick, to see who is already on Resbite and to send your invitations.
- You can delete your account at any time, in the app.

Resbite is run by Resbite Ltd, a company registered in England and Wales.

Terms of Use: https://link.resbite.com/terms
Privacy Notice: https://link.resbite.com/privacy
Support: https://link.resbite.com/support
```

Where each claim comes from, so the copy promises only what 1.0 has:

| Claim | Source |
|---|---|
| Ideas, time, place, cover, description, note to guests | The Create tab and the resbite page (`mobile/app/(tabs)/_layout.tsx`; `mobile/src/domain/eventPage.ts`) |
| Private details for Going or Maybe | Meeting details are shown to hosts and guests who answered Going or Maybe (data inventory §4) |
| Contacts one by one, or a typed number; sent from your own messaging app | `mobile/src/state/useContactInvites.ts`; `mobile/src/services/inviteSend.ts` (PERM-4) |
| Answer on the web | The `/i/` page (`links/assets/personal-flow.mjs`) |
| Event link with approval | Open-link approval (`supabase/migrations/20261029120000_open_link_approval.sql`) |
| Admin, bring someone | "Make admin" (`mobile/src/domain/eventPage.ts`); circle of trust (`mobile/src/domain/circleCopy.ts`) |
| Chat, announcements, mute | Chat core, groups and safety, live on hosted (`qa/chat-release/README.md`, "Applied") |
| Every week or every two weeks; next one set up for you | `mobile/src/domain/planCopy.ts` ("Every week", "Every 2 weeks"); **needs the roll job (C4)** |
| No public search | `mobile/src/domain/connectionsCopy.ts` ("There is no search.") |
| Calendar, reminders a day and an hour before | `mobile/src/domain/calendarEvent.ts`; `mobile/src/domain/reminders.ts` |
| Filter for abusive words; report or block | Live for chat; **titles, descriptions, notes and names need C7** |
| No ads, no tracking | No ad, analytics or tracking SDK (`mobile/package.json`; PRV-14) |
| Delete in the app | **Needs B3 and C2** |
| Resbite Ltd, England and Wales | Owner facts, 17 November 2026 |
| The three URLs | **Need D1** |

### 3.3 Keywords (96 bytes)

```text
friends,invite,get together,group chat,events,weekly,organiser,RSVP,planner,catch up,games night
```

- "Resbite" and "Resbite Ltd" are left out: Apple already searches the app and company name.
- "plans" and "people" are left out: the subtitle already carries them.
- No other app's or company's name. Do not add the name of any messaging app.

### 3.4 What's New

Not shown for a first version. Leave it empty.

## 4. URLs and copyright

| Field | Page | Answer for 1.0 | Why |
|---|---|---|---|
| Support URL | Version page | **https://link.resbite.com/support** | Required. It must lead to real contact details (Apple: "legal address, email address, telephone number, as may be required by local law"). A4 on `/support` gives support@resbite.com, the web contact form, the registered office (86-90 Paul Street, London EC2A 4NE) and the company details. There is no public phone; D-5 asks the solicitor to confirm that email, the form and a postal route meet UK law. **Needs D1, F1.** |
| Marketing URL | Version page | **Leave empty** [[OWNER: Marketing URL — proposed: leave it empty for 1.0, or https://www.resbite.com once the F18 check passes]] | Optional. The marketing site is outside this repo and its legal pages are unchecked (WEB-8, F18). |
| Privacy Policy URL | App Privacy page | **https://link.resbite.com/privacy** | Required for iOS apps. A1. **Needs D1.** |
| Privacy Choices URL | App Privacy page | **https://link.resbite.com/delete-account** | Optional. Apple describes it as a page "where users can access their data, request deletion, or make changes". A6 explains deletion in the app and by request, and its section "Other choices about your data" says how to ask for a copy of your data or a correction. **Needs D1.** |
| Copyright | Version page | **2026 Resbite Ltd** | Required: the year the rights were obtained, then the owner. Apple adds the © itself. |
| Version | Version page | **1.0.0** | Must match the build's version, set in `mobile/app.json` by B13 (today it reads `0.1.0`). |
| Age Suitability URL | Age rating dialog | **Leave empty** | Optional. There is no separate age page; the Terms say 18+. |

## 5. Age rating questionnaire

App Information → Age Ratings → Set Up Age Ratings (or Edit). The questionnaire has asked the new 2025-2026 questions since 31 January 2026. Since 16 November 2026 it also asks two new declarations, Shared Location and Dating and Relationships, which every app must complete by 12 January 2027. Answer each question honestly (guideline 2.3.6), then override.

Apple's definitions below were read on 17 November 2026 from "Age ratings values and definitions" and the news post of 2 November 2026.

| Section | Question | Answer | Apple's definition (short) | Why this answer | Maps to |
|---|---|---|---|---|---|
| In-app controls | Parental Controls | **No** | Tools for parents to monitor, manage or restrict a child's use | Resbite has none. It is for adults. | — |
| In-app controls | Age Assurance | **No** | A mechanism to confirm a person's age, such as the Declared Age Range API, age estimation or ID checks | The "I'm 18 or over" tick is a self-declaration. It does not confirm age, and Declared Age Range is not built (D-16 default: defer). Whether Apple's UK adult checks change this is open (ASC-17). | — |
| Capabilities | Unrestricted Web Access | **No** | Users can go to any web page inside the app, such as an embedded browser | No in-app browser. Chat links and legal links open in Safari, outside the app (`Linking.openURL`, `mobile/app/chat.tsx`; `mobile/src/design/TickRow.tsx`). Google sign-in uses the system's authentication sheet for that one page (`WebBrowser.openAuthSessionAsync`, `mobile/src/state/useAuthFlow.ts`), not a browser the user can steer. **B1 must keep opening legal pages in Safari**, or this answer must be checked again. | — |
| Capabilities | User-Generated Content | **Yes** | Broad distribution of content users create | Chat, announcements, profile and cover photos, titles and descriptions are shown to other people, and titles, host names and cover photos appear on public event link pages. | 4+ |
| Capabilities | Social Media | **No** | Redistribution or amplification of user content through a feed or similar discovery that visibly spreads content to many users (views, likes, comments, shares) | Resbite has no feed, no likes or shares and no discovery. Content stays with the people on a resbite, and you can connect only with people who shared one with you ("There is no search", `mobile/src/domain/connectionsCopy.ts`). The gap analysis leaned towards Yes before Apple's definition was read; see the open points. | — |
| Capabilities | Social Media Disabled for Users Under 13 | **No** | Under-13s are kept from social features, with Declared Age Range | Not applicable: no social media capability, and no users under 18. | — |
| Capabilities | Messaging and Chat | **Yes** | Users talk to each other directly, including group messaging | Every resbite has a chat; hosts post announcements. | 4+ |
| Capabilities | Advertising | **No** | Paid promotion of products or services in the app | No ads. | — |
| Mature themes | Profanity or Crude Humor | **None** | — | The app's own content has none. User content is covered by the User-Generated Content answer. | — |
| Mature themes | Horror/Fear Themes | **None** | — | None. | — |
| Mature themes | Alcohol, Tobacco, or Drug Use or References | **Infrequent** | — | The ideas catalogue includes "Wine tasting", kept as an adult activity when it was published (`docs/implementation-status.md:268`). | 13+ |
| Medical or wellness | Medical or Treatment Information | **None** | — | None. | — |
| Medical or wellness | Health or Wellness Topics | **No** | — | The Wellness tab is hidden for 1.0 (D-7, **B4**). Ideas such as "Walk and talk" or "Spa day" are social plans, not health or wellness content. If B4 is not built, this answer becomes Yes. | — |
| Sexuality or nudity | Mature or Suggestive Themes; Sexual Content or Nudity; Graphic Sexual Content and Nudity | **None** | — | None in the app's own content. | — |
| Violence | Cartoon or Fantasy Violence; Realistic Violence; Prolonged Graphic or Sadistic Realistic Violence; Guns or Other Weapons | **None** | — | None. | — |
| Chance-based activities | Gambling; Simulated Gambling; Contests; Loot Boxes | **None** | — | None. | — |
| New (16 Nov 2026) | Shared Location | **No** (judgement) | "Sharing of real-world location with another person or group" | The app never reads the device's location (`expo-location` is removed by **B8**). A host types a meeting place for a planned get-together; nobody's live or current location is shared. See the open points. | — |
| New (16 Nov 2026) | Dating and Relationships | **No** | "Features that enable dating or relationship connections between real people and/or a virtual companion that engages a user in sexual or romantic content" | Resbite plans group get-togethers among friends. Connections are a friends list between people who met at a resbite, with no search, profiles to browse or matching. | — |
| Age categories and override | Made for Kids | **No** | — | Not a children's app. | — |
| Age categories and override | Override to Higher Age Rating | **Yes: 18+** | "If your app has a EULA with minimum age requirements that exceed the rating that Apple calculated, you must override to a rating that adheres to the requirements." | The Terms of Use (A3) set 18 as the minimum age, and every account confirms it (B2). | **18+** |

**Result.** Apple's calculated rating is **13+** (from the infrequent alcohol reference; user content and chat map to 4+). The override sets the rating to **18+**, which the UK App Store shows. The content descriptions still reflect the answers above.

If Shared Location or Dating and Relationships were answered Yes, the result would still be 18+: Dating and Relationships carries a minimum of 18+, and Shared Location does not raise the rating in most regions. The UK result does not depend on those two judgements.

## 6. App Privacy answers

App Store Connect → App Privacy. Derived from the data inventory (`research_notes/App Store readiness/audit-data-inventory.md` §2 to §16) and the gap analysis' E3, for the 1.0 target state: the optional date of birth, second phone, city and interests removed (D-9, **B11, C9**); `expo-location` removed (**B8**); the Wellness tab hidden (**B4**); no crash or analytics SDK (D-15); the support inbox live (**F1**).

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking.** No data type is used for tracking. Resbite does not link its data with other companies' data for advertising, does not share data with data brokers, and does not read the advertising identifier (PRV-14). No App Tracking Transparency prompt is needed.

**Purposes.** Every collected type is used for **App Functionality** only. Apple's App Functionality includes signing people in, running features, preventing fraud, security and customer support, which covers moderation and safety. No type is used for Analytics, Product Personalisation, Developer's Advertising or Marketing, Third-Party Advertising or Other Purposes.

**Linked to the user.** Every collected type is **linked**: it is personal data held against an account. (Apple treats personal data under privacy law as linked.)

| Apple category | Data type | Collected | Linked | Tracking | Purposes | What it is in Resbite | Source |
|---|---|---|---|---|---|---|---|
| Contact Info | Name | **Yes** | Yes | No | App Functionality | Display name; the Apple or Google name offered at sign-in; the name typed on a web invitation | DI §2–3 |
| Contact Info | Email Address | **Yes** | Yes | No | App Functionality | The sign-in email for email, Apple (possibly a relay address) and Google accounts; emails to support | DI §2 |
| Contact Info | Phone Number | **Yes** | Yes | No | App Functionality | The verified mobile number every account needs; invited contacts' numbers | DI §2, §5 |
| Contact Info | Physical Address | No (judgement) | — | — | — | The meeting place is free text a host types about a plan, not the user's address. It is declared under Other User Content. | DI §16 |
| Contact Info | Other User Contact Info | No | — | — | — | — | — |
| Health & Fitness | Health; Fitness | No | — | — | — | Wellness hidden (B4); no HealthKit or motion data | DI §11 |
| Financial Info | Payment Info; Credit Info; Other Financial Info | No | — | — | — | No payments | — |
| Location | Precise Location | No | — | — | — | The app never reads the device's location; the latitude and longitude columns are never sent | DI §4, §11 |
| Location | Coarse Location | **No** | — | — | — | The optional city is removed (B11, C9). The "area" a host types describes a plan, not the user or device. | DI §2 |
| Sensitive Info | Sensitive Info | No | — | — | — | Not collected as a data type | — |
| Contacts | Contacts | **Yes** | Yes | No | App Functionality | The numbers a user picks from their contacts, checked and stored for invitations; connections (a social graph) | DI §5, §12 |
| User Content | Emails or Text Messages | **Yes** | Yes | No | App Functionality | Chat messages and announcements (sender, chat, words) | DI §6 |
| User Content | Photos or Videos | **Yes** | Yes | No | App Functionality | Profile photos and cover photos | DI §3–4 |
| User Content | Audio Data; Gameplay Content | No | — | — | — | — | — |
| User Content | Customer Support | **Yes** | Yes | No | App Functionality | Emails to support@resbite.com and privacy@resbite.com, web contact form messages, report details | DI §16; **F1** |
| User Content | Other User Content | **Yes** | Yes | No | App Functionality | Titles, descriptions, places, areas, meeting details, notes to guests, cover descriptions, answers, join requests, reports, blocks, connection answers | DI §4, §7 |
| Browsing History | Browsing History | No | — | — | — | — | — |
| Search History | Search History | No | — | — | — | The ideas search runs on the phone | DI §16 |
| Identifiers | User ID | **Yes** | Yes | No | App Functionality | The account id | DI §2 |
| Identifiers | Device ID | **Yes** (judgement) | Yes | No | App Functionality | The Expo push token, a device-level id used only to send notifications | DI §8 |
| Purchases | Purchase History | No | — | — | — | — | — |
| Usage Data | Product Interaction | **Yes** | Yes | No | App Functionality | First and last app session (to show "On Resbite" only for people who use the app); chat read position (unread counts). Link-open counts are kept without any identity. | DI §3, §5, §6 |
| Usage Data | Advertising Data; Other Usage Data | No | — | — | — | — | — |
| Diagnostics | Crash Data; Performance Data; Other Diagnostic Data | No (judgement) | — | — | — | No crash or performance SDK (D-15). Server request logs are kept 7 days for operation only. Crash reports that Apple gathers through "Share With App Developers" are Apple's collection, which Apple says developers need not disclose. | DI §9, §16 |
| Surroundings; Body | Environment Scanning; Hands; Head | No | — | — | — | — | — |
| Other Data | Other Data Types | **Yes** | Yes | No | App Functionality | The 18+ and Terms acceptance record (with its version) and the chat rules acceptance | DI §3; **B2, C8** |

**The product page will then show:** Data Linked to You: Contact Info, Contacts, User Content, Identifiers, Usage Data, Other Data. Data Used to Track You: none. Data Not Linked to You: none.

**Third-party code.** Apple counts data collected by third-party code inside the app. Resbite's SDKs (Expo modules, React Native) collect nothing for themselves (DI §15). The CAPTCHA widget will be the exception: [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]].
- Before entering these answers, read the chosen vendor's own App Store privacy details.
- Add every data type it lists, with the purpose App Functionality (fraud prevention and security) and the linked and tracking flags the vendor gives.
- If the vendor's code tracks in Apple's sense, do not ship it: no App Tracking Transparency prompt is planned.
- **Needs B16 and D10.**

**Servers and processors** (Supabase, Expo push, Apple, Google, Resend, the SMS provider, Vercel, Cloudflare for DNS, the mailbox provider) are not third-party code in the app. What they receive is our data and is already counted above. They are named in the Privacy Notice (A1).

**Keep three things in step** (APL-49, F12):
1. These answers.
2. The app's privacy manifest, `ios.privacyManifests` in `mobile/app.json` (**B13**): `NSPrivacyTracking` false, no tracking domains, and one collected-data entry per "Yes" row above, each linked, not tracking, purpose App Functionality. The constant names B13 will use are, from Apple's privacy manifest documentation (confirm them in B13): `NSPrivacyCollectedDataTypeName`, `…EmailAddress`, `…PhoneNumber`, `…Contacts`, `…EmailsOrTextMessages`, `…PhotosorVideos`, `…CustomerSupport`, `…OtherUserContent`, `…UserID`, `…DeviceID`, `…ProductInteraction`, `…OtherDataTypes`, with `NSPrivacyCollectedDataTypePurposeAppFunctionality`.
3. The Privacy Notice (A1).

A change to any one means a check of the other two, at every release.

## 7. Export compliance

| Question | Answer | Why |
|---|---|---|
| Encryption | **Exempt only. No documentation.** The build declares `ITSAppUsesNonExemptEncryption` = false (`mobile/app.json:16`), so App Store Connect should not ask about each build. | The app uses only encryption built into iOS: HTTPS, the Keychain (`expo-secure-store`) and hashing (`expo-crypto`). There is no custom cryptography (APL-57). |
| If App Store Connect asks anyway | Choose the answer that says the app uses no encryption algorithms other than those in Apple's operating system. | Check the wording at the time; it was not re-read for this pack. |
| France | Not applicable | The app is not distributed in France. |

## 8. Content rights

**Answer: Yes. The app contains, shows or accesses third-party content, and Resbite Ltd has the rights it needs.**

- **User content.** Users post chat messages, photos, titles and descriptions. The Terms of Use (A3) give Resbite Ltd a licence to host and show that content to the people it is shared with, and set the community rules (guideline 1.2).
- **Fonts.** Montserrat and Quicksand are bundled under the SIL Open Font Licence, whose texts sit beside the fonts (`mobile/assets/fonts/Montserrat-OFL.txt`, `Quicksand-OFL.txt`). The in-app Licences screen shows them (**B1, A25**).
- **Illustrations.** The activity pictures are Resbite's own artwork (`docs/implementation-status.md:26`).
- **Open-source code** (MIT and others) is credited on the Licences screen (**A25**).

How App Review treats user content under this question is UNVERIFIED (gap analysis open question 7). Answering Yes, with the Terms' licence behind it, is the cautious choice.

## 9. EU Digital Services Act trader status

**Answer for 1.0: "This is not a trader account"** (or, for this app only, trader status off), because the app is distributed on the App Store only in the United Kingdom.

- Apple, read on 17 November 2026: "Even if you don't distribute apps in the EU, you'll still need to declare a trader status." And: "If you don't distribute apps on the App Store in the EU (for example you only distribute apps … on the App Store only outside the EU), you're not acting as a trader on the App Store."
- **Where.** Business → Agreements → Compliance → Digital Services Act → Complete Compliance Requirements (Account Holder or Admin). The per-app setting is under the app → General → App Compliance → Digital Services Act → Edit. App Store Connect may also ask at submission.
- **What is published.** Nothing. Apple publishes trader contact details only on EU product pages.
- **If the EU is added later** (D-2, A21): Resbite Ltd would very likely be a trader (a company acting in the course of business). Change the status first, and give a phone number and an email that Apple verifies and publishes on EU product pages. There is no public phone today, so that is a decision for then.

## 10. App Review Information

On the version page. It is not shown to customers and can be edited at any time.

| Field | Answer | Notes |
|---|---|---|
| Sign-in required | **Yes** | The app needs an account. |
| User name and password | [[OWNER: review account email and password — proposed: account R1 of the pack's section 12, typed only into App Store Connect's Sign-In Information, never into the repo]] | The review account (R1) in section 12. Email and password, so no code is asked. Apple: the demo account "must not expire". |
| Contact: first name, last name, phone, email | [[OWNER: App Review contact name, email and +44 phone — proposed: the owner, with support@resbite.com as the email, typed only into App Store Connect, never into the repo]] | The phone must be in international format with a plus sign. It is for App Review only and is never published. The email can be support@resbite.com if the owner prefers a role address. |
| Notes | The text block in [app-store-review-notes.md](app-store-review-notes.md), with its placeholders filled in App Store Connect only | Up to 4,000 bytes. Apple asks for "details for additional accounts" in the Notes, so the deletion-test account's sign-in goes there: [[OWNER: deletion-test account email and password — proposed: account R2 of the pack's section 12, typed only into the Notes in App Store Connect, never into the repo]]. The notes also name [[OWNER: SMS provider — proposed: Twilio]] and [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]], and need [[OWNER: devices and iOS versions tested — proposed: each iPhone model and iOS version from the runbook's device checks, and the iPad used in iPhone compatibility mode]]. |
| Attachment | Optional. A short screen recording, made on the submission build with the review accounts, showing Report, Block and Delete account. | No personal data in it. It can save a round trip with App Review. |

## 11. Version release

- **Version release: Manual** ("When the app status changes to Pending Developer Release after approval, … you must manually release the version"). D-24, ASC-18.
- Why: with Automatic, the app would go live the moment it is approved, perhaps before the inboxes, the backup moderator and the roll job are confirmed, and before `APP_STORE_URL` and `APP_STORE_ID` are set on the link site. The go-live checklist is in the [release runbook](README.md), phase 7.
- **Phased release** applies only to updates. It is not offered for 1.0.

## 12. The review account plan

Rows SI-2 and E7 of the gap analysis, and chat runbook step 6a (`qa/chat-release/README.md:707-717`), updated for the open beta and the 1.0 target state.

### 12.1 How the reviewer signs in without an SMS

- After the SMS sitting (C1), every phone code is a real text message. A reviewer cannot receive one for our numbers.
- Every account needs a verified mobile number (`mobile/src/domain/accountRoute.ts:11`).
- So the review account signs in with **email and password**. Its number was verified once, by the owner, while setting it up.
- Password sign-in asks for no code (`signInWithPassword`, `mobile/src/state/useAuthFlow.ts`). With a verified number and a name, the account route sends it straight into the app (`mobile/src/domain/accountRoute.ts:10-13`).
- The path: first screen → "I have an account" → "Use email and password" (`mobile/app/index.tsx`; `mobile/app/auth/phone.tsx`).
- **Not used:**
  - **Supabase's fixed test phone numbers.** Whether they work with our custom Send SMS hook is UNVERIFIED (gap analysis open question 20).
  - **Sign in with Apple or Google.** A reviewer's own Apple ID would make a new account, which then needs a text message to a number.
- **The tester roster plays no part.** Since the open beta, any confirmed account may use the app (`supabase/migrations/20261116120000_open_beta.sql:40-48`). The roster step at `qa/chat-release/README.md:709` is out of date.

**The code differs from E7 here.** E7 says to "create two email-and-password accounts" but not how. The app no longer offers email sign-up: register mode redirects to the phone screen (`mobile/app/auth/index.tsx:50`). So the owner creates each email account in the Supabase dashboard: Authentication → Users → Add user → Create new user, with "Auto Confirm User" ticked. Check the labels at the time. **That is a hosted step and needs the owner's approval.** The account then signs in on the submission build, adds its number with a real code, and sets its name.

### 12.2 Accounts

Fictional personas only (guideline 2.3.9). None is a moderator: a report never notifies the reporter or the person reported, so a reviewer who reports the host must reach a moderator who is neither (chat runbook, review M2).

| Account | Persona name | Role | How it signs in | Its number | State at submission |
|---|---|---|---|---|---|
| R1, review account | Sol | What the reviewer uses | Email and password, in Sign-In Information | One of the owner's numbers, verified once by SMS | Name set. Terms and 18+ accepted at setup (the B2 screen comes before the name). **Has not agreed to the chat rules**, so the reviewer meets the rules sheet. Going on the weekly group; invited and not answered to the one-off; one connection request waiting, from Ana. Not a moderator. |
| R2, deletion-test account | Mia | For the reviewer to delete | Email and password, in the Notes | A second number, verified once | Name set, Terms accepted. In none of R1's resbites, so deleting it changes nothing R1 sees. Hosts nothing. |
| H1, host | Ana | Hosts both seeded resbites and writes in their chats | Email and password (owner only; not given to Apple) | A third number, verified once | Not a moderator. |

- **Numbers:** [[OWNER: three mobile numbers the owner controls, none already on a Resbite account — proposed: one per review account, verified once by text and never written in the repo]]. Each account needs its own number: a number already on an account is refused ("This number already belongs to another Resbite account", `mobile/src/domain/phoneCopy.ts`). A fourth persona, a second guest who also writes in the group chat, would make the chat look livelier but needs a fourth number. It is optional.
- **Emails:** addresses the owner can read, on the operator's domain. They are never written in the repo.
- **Passwords:** long, unique, kept in the owner's password manager.
- **Never expires.** Supabase accounts do not expire, and password sign-in works whenever the reviewer starts.
- **The backup moderator** must be named and on the moderators list before submission (C5): [[OWNER: the backup moderator's identity — recorded only in the signed team access agreement kept outside the repo; the repo records only that a backup is named, and the date — proposed: one named person at the Supabase Developer role with MFA, named before the 1.0 submission]]. The notes promise action within 24 hours with cover when the owner is away.

### 12.3 Seeded resbites, chats and connection

Set up by the owner on the submission build, as Ana, after the roll job (C4) is live. Titles: [[OWNER: titles of the two seeded resbites — proposed: "Thursday board games" and "Picnic in the park"]]. Both come from the ideas catalogue (Board game night, Picnic in the park) and suit a 4+ audience.

| Item | Set-up | Why |
|---|---|---|
| **Weekly group** "Thursday board games" | Ana creates it, repeating **Every week**, first occurrence within the next few days, with a place and a short description. She invites Sol by typing Sol's number (Sol uses the app, so the server adds Sol to the guest list and keeps no number). Sol answers **Going**. Ana writes two or three friendly messages in Group chat and posts one announcement. | A group's chat never closes while it repeats, so the reviewer always finds an open chat with Report and Block (chat runbook, challenge I8). The roll job creates next week's occurrence and carries Sol over (**C4**). |
| **One-off** "Picnic in the park" | Ana creates it **three to five weeks ahead** and invites Sol, who does **not answer**. Ana posts an announcement to Everyone invited. | Report and Block on an unanswered invitation card and its page. Not a group: a group's announcement line belongs to the current occurrence and goes at the next roll (ruling GR4). Far enough ahead that it does not end during review. |
| **Connection request** | From the group's people list, Ana taps Connect on Resbite for Sol. Sol does not answer. | Report and Block on Profile → Connections. |
| **Your own resbite** | Nothing to seed. The notes tell the reviewer they can create one from Create. | Shows the core flow; contacts access stays optional. |

### 12.4 Before each submission, and after each review

- [ ] R1, R2 and H1 each sign in with email and password on the submission build. No code and no add-phone screen appear.
- [ ] The weekly group shows its next occurrence, and `roll-repeating-plans` has run in the last hour (the runbook's "Roll job check").
- [ ] The one-off is still at least two weeks away. If not, move its date.
- [ ] R1 has still not agreed to the chat rules. If a reviewer agreed in an earlier round, clear that acceptance in the SQL editor with the statement in the chat runbook's step 7 ("The rules come first"), typing R1's email only in the editor's copy.
- [ ] R2 still exists. If a reviewer deleted it, wait for the deletion to complete, then make it again (12.1). Its number is free again once the Auth user is gone.
- [ ] If a reviewer deleted R1, make R1 again and seed 12.3 again.
- [ ] None of the three is a moderator. `supabase/ops/moderators.sql` makes the list exactly the emails typed into it (the owner's and the backup's), and the chat runbook's `ch3-gate.sh` shows `moderators` 2.
- [ ] Record "review accounts checked" and the date in the runbook's "Applied", never an email, number or account id.

## 13. Screenshots

Rules read on 17 November 2026 (App Store Connect "Screenshot specifications"):
- **Required:** at least one screenshot for **iPhone with Dynamic Island (medium display)**.
- Up to 10 per size. `.jpeg`, `.jpg` or `.png`. **No alpha channel or transparency.**
- No iPad set is needed: the app does not run as an iPad app (`supportsTablet: false`).

| Set | Size, portrait | Devices it represents | Status |
|---|---|---|---|
| Dynamic Island, medium | **1206 × 2622** (or 1179 × 2556) | iPhone 18 Pro, 17 Pro, 17, 16 Pro, 16, 15 Pro, 15, 14 Pro | **Required** |
| Dynamic Island, large | **1320 × 2868** (or 1290 × 2796, 1260 × 2736) | iPhone Air, 18 Pro Max, 17 Pro Max, 16 Pro Max, 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max | Recommended, so large phones get sharp images |
| iPhone Duo | 1398 × 2034 and 2007 × 2853 | iPhone Duo | Not needed for 1.0. Apple will require it from April 2027 for apps built with the iOS 27.1 SDK or later. |

The gap analysis (E8) offered "1320×2868 or 1206×2622". Apple's page now names the medium size as the required one and does not say a large set satisfies it, so upload the medium set in any case.

**What each screenshot shows.** The same six, in this order, in both sets:

| # | Screen | Shows | Optional caption |
|---|---|---|---|
| 1 | My resbites | Ana's upcoming resbites: the weekly group and two one-offs with covers, answers and times | "Small plans with your people" |
| 2 | Create | The ideas: Coffee together, Walk and talk, Picnic in the park, Board game night | "Start from an idea" |
| 3 | A resbite page | Picnic in the park: time, area, cover, who's going, the chat row | "See who's going" |
| 4 | Invite people | Picking friends one by one from contacts | "Invite friends by number" |
| 5 | Group chat | Friendly messages and a pinned announcement | "Chat with everyone" |
| 6 | The weekly group | "Every Thursday", the people in the group, next week's date | "Weekly groups that keep going" |

**Rules for the content** (guidelines 2.3.3, 2.3.8, 2.3.9):
- **Fictional people only:** Ana, Pedro, Clara, Sol, Leo, Mia. Use initials or the app's own illustrations for avatars and covers, never a photo of a real person.
- **No real phone numbers.** Where a number shows, use Ofcom's drama range 07700 900000 to 07700 900999, which Ofcom keeps out of allocation to phone companies. Add those contacts to the Simulator's Contacts.
- **Suitable for 4+,** even though the app is 18+. Leave out "Wine tasting" and any other alcohol picture or wording.
- Show the app in use. No sign-in screen, splash or title art alone.
- Not the Wellness tab (hidden in 1.0), not the design preview, not a development build.
- Take them from the 1.0 build, or one with exactly its UI, against hosted test data.

**How to make them** (on the Mac, where the Simulator runs):
1. Run the build in the iPhone 17 Pro Simulator (1206 × 2622) and the iPhone 17 Pro Max Simulator (1320 × 2868).
2. Set a clean status bar: `xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`.
3. Capture with `xcrun simctl io booted screenshot <file>.png`.
4. Check the size and alpha with `sips -g pixelWidth -g pixelHeight -g hasAlpha <file>.png`.
5. If `hasAlpha` is yes, convert: `sips -s format jpeg <file>.png --out <file>.jpg`.
6. Captions, if used, are added in a design tool. Keep the output size exactly as above.

App previews (videos) are optional. None for 1.0.

## 14. Checks before entering the pack

- [ ] The four URLs load publicly over HTTPS, with no sign-in, and show the published documents (D1).
- [ ] The description's claims hold on the submission build (section 3.2 table).
- [ ] The App Privacy answers match the Privacy Notice and the build's privacy manifest (section 6).
- [ ] The age answers hold on the build: no Wellness tab, no location prompt, no in-app browser (section 5).
- [ ] The review notes' paths work on the build, and the filled text is under 4,000 bytes ([app-store-review-notes.md](app-store-review-notes.md)).
- [ ] The trader status is declared (section 9).
- [ ] Version release is Manual (section 11).

## 15. Apple pages read for this pack (17 November 2026)

- Age ratings values and definitions: https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions
- Set an app age rating (override): https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating
- New age rating descriptors, 2 November 2026: https://developer.apple.com/news/?id=yxkh08us
- App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Platform version information (promotional text, description, keywords, URLs, copyright, App Review Information, version release): https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- App information (name, subtitle, category, content rights, SKU, licence): https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- Screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- DSA trader requirements: https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements
- Export compliance overview: https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance
- Regulated medical device status: https://developer.apple.com/help/app-store-connect/manage-app-information/declare-regulated-medical-device-status/
- Ofcom, numbers for drama: https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/numbers-for-drama

## Open points

For the owner unless marked.

1. **Social Media: No.** Apple's definition is about feeds and discovery that spread content to many users. Resbite has neither. The gap analysis leaned towards Yes before the definition was read. Either answer leaves the rating at 18+. Choose No unless you want the cautious Yes.
2. **Shared Location: No (judgement).** A typed meeting place, sometimes a home address, is shared with the people on a resbite. Apple's wording ("sharing of real-world location with another person or group") could be read to cover that. Yes would not change the UK rating. Decide before submission; the solicitor may want a view, since the Privacy Notice describes the meeting place.
3. **Age Assurance and Apple's UK adult checks (ASC-17, D-16).** Ask Apple Developer Support or the solicitor, before submission, whether the UK is a region where developers must use Declared Age Range. If it is, D-16 builds it, and Age Assurance becomes Yes.
4. **Content Rights.** How App Review treats user content is UNVERIFIED. The pack answers Yes, relying on the Terms' licence.
5. **Trader status.** "Not a trader" is right only while no EU storefront is chosen. Adding the EU needs a verified, published phone number, and there is none today.
6. **The review accounts need a hosted step and three numbers.** The app has no email sign-up, so the email accounts are made in the Supabase dashboard (approval needed). Each needs its own mobile number that the owner controls.
7. **B3 must keep a password proof within reach** for an email account that also has a verified phone. Today the screen asks for an email code first, with "Use my password instead". A reviewer can receive neither an SMS nor an email code.
8. **Judgement calls on App Privacy:** the push token as Device ID (Yes); server logs as Diagnostics (No); the meeting place as Physical Address (No). The solicitor should see that the Privacy Notice describes all three the same way.
9. **The Privacy Choices page** (`/delete-account`) now says how to ask for a copy of your data or a correction (cross-check, 17 November 2026), matching Apple's description of that URL.
10. **Mac and Vision Pro availability** off for 1.0, until tested.
11. **Screenshot size.** Upload the 1206 × 2622 set. The gap analysis' "1320×2868 or 1206×2622" may not be enough on its own.
12. **Name and copy approval.** The name was reserved with the app record; the subtitle, promotional text, description and keywords await the owner's approval.
