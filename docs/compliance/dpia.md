# Data protection impact assessment (DPIA)

| | |
|---|---|
| **Controller** | Resbite Ltd, a private limited company registered in England and Wales, company number 12450334. Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom. Data protection contact: privacy@resbite.com |
| **Owner of this record** | The owner, for Resbite Ltd |
| **Version** | 1.0 — draft for solicitor review (decision D-12). Not signed off. |
| **Date** | 17 November 2026 |
| **Next review** | Before the 1.0 submission, to confirm every measure marked "To build" is live. Then by 17 November 2027, and sooner on any trigger in section 9. |
| **Purpose** | To assess, before the public launch, the risks Resbite's processing poses to people, and to record the measures that bring those risks down (UK GDPR Art 35). |
| **Gap analysis item** | A9, closing rows PRV-5 (LAW-7), PRV-17, PRV-20 and SI-11 of `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md` |

## Placeholders to fill

1. [[OWNER: Twilio's region and transfer safeguard, to confirm when Resbite Ltd's account accepts Twilio's Data Protection Addendum — proposed: the United States, Twilio's main processing location, under the UK–US data bridge (Twilio Inc. states it takes part in the UK Extension to the EU–US Data Privacy Framework; check the live listing), with the UK Addendum to the EU Standard Contractual Clauses in Twilio's addendum as the fallback; Twilio's Ireland region (IE1) also offers messaging]] (section 2.1)
2. [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]] (section 2.1; R2 in section 5.1)
3. [[OWNER: the backup moderator's identity — the owner names one backup (decision AS-D6); recorded only in the signed team access agreement kept outside the repo; the repo records only that a backup is named, and the date — proposed: at the Supabase Developer role with MFA, named before the 1.0 submission]] (R11 in section 5.6)
4. [[OWNER: the DPA 2018 Schedule 1 condition for criminal offence data in reports, chosen with the solicitor — proposed: paragraph 12 (regulatory requirements relating to unlawful acts), with paragraph 10 (preventing or detecting unlawful acts) as the alternative, each extended to criminal offence data by paragraph 36; paragraph 18 (safeguarding) for child-safety reports; paragraph 33 (legal claims) for records under a legal hold]] (section 4.1)
5. [[OWNER: Vercel function region — proposed: London (lhr1)]] (section 2.1)
6. [[OWNER: summary of the solicitor's advice on this DPIA — proposed: written here after the review, with any advice not followed and the reason]] (section 8)
7. [[OWNER: sign-off date — proposed: after the solicitor's review and once every "To build" measure is live]] (section 8)

## How to read this

- **Target state.** This DPIA describes Resbite **as it will be at version 1.0**, after workstreams B, C, D and F of the gap analysis are built, using the owner's answers and the rulings of 17 November 2026 (AS-D1 to AS-D8 and AS-R1 to AS-R9 in `knowledge-base/08-decisions.md`) and otherwise the gap analysis' recommended default for each owner decision (D-3 to D-25). Each measure carries its status on 17 November 2026: **Live** (built, and on the hosted project where it needs the backend), or **To build** with the workstream id (for example C3). Sign-off is conditional on every "To build" measure being live before submission.
- **Evidence.** Each mechanism was checked in the code on 17 November 2026 (branch `app-store-readiness` at `de8ba6a`, whose code matches `main` at `db8a221`). File paths point to the latest definition. Where the code and the gap analysis disagree, this record follows the code and says so.
- **Scoring.** We follow the ICO's sample DPIA template (read through search extracts). Likelihood is remote, possible or probable. Severity is minimal, significant or severe. Overall risk comes from this grid:

  | | Minimal | Significant | Severe |
  |---|---|---|---|
  | **Remote** | Low | Low | Medium |
  | **Possible** | Low | Medium | High |
  | **Probable** | Medium | High | High |

- **The regulator** is the Information Commission, which took over the Information Commissioner's Office's functions on 30 September 2026 and still uses the name ICO (ico.org.uk). This record calls it "the ICO".
- **UNVERIFIED** marks a point not confirmed from a primary source. **(x)** marks a regulator or legislation page read only through search-engine extracts, because the site refused automated reads.
- **No personal data.** This record names roles ("the owner", "the backup moderator"), never people.

## Summary

- **A DPIA is required.** Resbite matches phone numbers from different sources, processes the numbers of people who are not users and never see a notice from us before it happens, holds meeting places and times whose exposure could put people at physical risk, and relies on a self-declared age. Each of these is on the ICO's list of processing likely to be high risk (section 1).
- **21 risks** are assessed in section 5. Before measures, 7 are high, 12 medium and 2 low.
- **After measures, none is high.** Seven stay medium and are accepted with reasons: discoverability by number (R1), earlier chat messages read by later joiners (R7), self-declared age (R9), team access to all content (R11), reused phone numbers (R12), image abuse without automated matching (R15), and a breach of the central database (R19). The rest are low.
- **No prior consultation with the ICO** (Art 36) is needed, because no residual risk is high. The solicitor is asked to confirm this.
- **Conditions of sign-off:** every "To build" measure is live; the backup moderator has signed A24 and has MFA on; the Expo and Twilio contracts are confirmed (F7); the solicitor has reviewed this DPIA and A23.

---

## 1. Step 1: Why we need a DPIA

UK GDPR Art 35(1) requires a DPIA before processing that is likely to result in a high risk to people. The law report advised one before launch (`research_notes/App Store readiness/uk-eu-law.md`, LAW-7). We checked the ICO's list of processing likely to result in high risk [ICO-DPIA] (x):

| ICO criterion | Applies? | Why |
|---|---|---|
| **Data matching**: combining, comparing or matching personal data from multiple sources | **Yes** | The contact lookup compares numbers a user picks from their own address book with the verified numbers of all users (section 5.1). |
| **Invisible processing**: data not obtained from the person, where giving Art 14 information individually is impossible or would need disproportionate effort | **Yes** | Numbers looked up but not stored reach us with no way to tell their holders. Numbers stored for a personal invitation reach us before their holder has seen anything from us (section 5.2). |
| **Risk of physical harm**: a breach could put people's health or safety at risk | **Yes** | Resbite holds where and when small groups meet, often at a home address, and who is going (section 5.8). |
| **Targeting of children or other vulnerable people** | **Considered, not met by design**, but children may get in | The service is for adults (18+) and is not offered to children. Age is self-declared, so children may still use it (section 5.4). |
| **Tracking** of location or behaviour | No | No device location, no analytics, no advertising identifiers, no tracking in Apple's sense (DI-26). The only usage records are first and last app session and chat read position. |
| **Denial of service** based on automated decisions or special category data | No | Suspensions are human decisions on reports. The blocked-terms filter refuses a single message or announcement and stores nothing (`supabase/migrations/20261111160000_chat_safety.sql:999-1001,1057`). No Art 22 decisions. |
| Innovative technology, large-scale profiling, biometric or genetic data | No | None of these is used. |

Two further factors push towards a DPIA: **criminal offence data** in reports (allegations count, DPA 2018 s.11(2)), and **messaging between people who may not know each other** through open links.

**Scope.** The whole service: the iPhone app (`mobile/`), the Supabase backend in London (`supabase/`), the link site link.resbite.com (`links/`), and the operations behind them (support, moderation, data requests, breaches). The UK storefront only (decision D-2). This DPIA sits beside the other compliance records, which it does not repeat:

| Record | Gap analysis item |
|---|---|
| Records of processing and lawful basis register | A8, A11 (`records-of-processing.md`) |
| Legitimate interests assessments | A10 (`legitimate-interests.md`) |
| Retention schedule | A12 (`retention-schedule.md`) |
| Online Safety Act illegal content risk assessment | A13 (`osa-illegal-content-risk-assessment.md`) |
| Children's access assessment | A14 (`childrens-access-assessment.md`) |
| Moderation and takedown standard | A15 (`moderation-standard.md`) |
| Data request procedure | A16 (`data-requests.md`) |
| Breach response runbook | A17 (`breach-response.md`) |
| Vendor register | A18 (`vendors.md`) |
| Law-enforcement and regulator requests | A22 (`law-enforcement-requests.md`) |
| Appropriate policy document for criminal offence data | A23 (`appropriate-policy-document.md`) |
| Team access instructions and confidentiality | A24 (`team-access.md`) |

---

## 2. Step 2: Description of the processing

### 2.1 Nature: what we do with the data

**The service.** Resbite helps people plan small get-togethers ("resbites"). A host creates a resbite, invites friends by phone number, from their connections or with a link, and everyone going chats about it. A repeating resbite is a weekly group with one running chat. Hosts may let guests bring people. The app is free, with no ads, no tracking and no in-app purchases.

**How we collect data.**

| Source | What | Where it enters |
|---|---|---|
| The user, at sign-up | A verified mobile number (required on every account); email and password, or an Apple or Google identity; a display name; the 18+ and Terms record | `mobile/app/auth/phone.tsx`, `mobile/app/add-phone.tsx`, `mobile/app/about-you.tsx`; the new acceptance screen (B2) |
| The user, while using the app | Profile photo; resbites (title, description, time, an optional public area, the exact place, meeting details, a cover photo); answers; chat messages; connections; blocks; reports | App screens; Supabase functions |
| The user's address book, one pick at a time | The phone numbers the user picks, never the whole address book; names never leave the phone | `mobile/src/services/contacts.ts`, `mobile/src/state/useContactInvites.ts:268-286`, `mobile/src/services/inviteCodeStore.ts:3-11` |
| Other users | A non-user's number, typed or picked by a host or a guest who may bring people; a removed person's number | `supabase/migrations/20261111160000_chat_safety.sql:580-720` (`invite_contacts`); `supabase/migrations/20261111130000_circles_of_trust.sql:45-56` (`plan_removals`) |
| Web visitors on link.resbite.com | Number, code, name, answer, the 18+ tick | `links/assets/personal.js`, `links/assets/personal-flow.mjs` |
| The system | Account id, session records, first and last app session, chat read position, push tokens, delivery records, link-open counts with no identity, logs | Supabase Auth, `private.app_sessions`, `private.device_endpoints`, `private.link_opens` |
| People who contact us | Support, privacy, complaint and report emails, and the `/support` contact form | The support and privacy inboxes (F1); the contact form (D1) |

**How we store and use it.** Everything server-side sits in one Supabase project in London (`eu-west-2`, Pro plan). Every table has row-level security on. The chat tables and every table in the `private` schema (invitations by number, removals, reports, blocks, push records) have no policy and no grant, so no app or web user can read them directly; the app reads them only through database functions that check the caller (for example `private.chat_member`, `supabase/migrations/20261111150000_chat_groups.sql:194-205`). Resbites, guest lists and profiles are read under policies that apply the same membership rules (`private.can_read_plan`, `private.can_read_profile`). Photos sit in two private Storage buckets and reach the app through signed links that last 300 seconds (`mobile/src/services/profile.ts:100`, `mobile/src/services/planCovers.ts:55-58`). The live chat signal carries only a message id, kind and state, never the words (DI §6). The link site runs on Vercel and talks straight from the browser to Supabase; its CSP allows only its own scripts and the Supabase host (`links/generate.mjs:106`).

**Who sees what.**

| Who | What they can see |
|---|---|
| The user | Their own account, profile and everything they take part in |
| Everyone invited to a resbite (pending included) | Its title, description, time, exact place, cover, host and note to guests (`private.can_read_plan`, `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:99-102`) |
| Guests who answered Going or Maybe | The private meeting details (door codes, directions) as well (DI §4) |
| Hosts, guests who have answered, and in a group everyone in its chat | The guest list (`private.can_see_guests`, `supabase/migrations/20261111150000_chat_groups.sql:574-580`) |
| Chat members | The whole chat history (section 5.3) |
| Anyone with an event link or a personal invitation link | The host's display name, title, time, optional area, cover and going count; a personal page also shows the invited number's calling code and last two digits (`private.invitation_page`, `supabase/migrations/20261031120000_creating_a_resbite.sql:247-264`) |
| Anyone who has a user's number | That the number belongs to someone "On Resbite" (section 5.1) |
| The team (the owner and the backup moderator) | Everything in the database, through the Supabase dashboard (section 5.11) |
| Processors | Supabase (everything), Expo (push tokens and push text), Resend (Auth emails), Vercel (link site requests), Twilio, the SMS provider (numbers, codes and service texts; decision AS-D5), the CAPTCHA vendor [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]], the mailbox provider for the inboxes and the log tool, Cloudflare (DNS queries, rarely a visitor's own IP address). Each is recorded in A18 |
| Independent controllers | Apple (Sign in with Apple, push delivery), Google (sign-in), WhatsApp or Apple Messages when a host sends an invitation from their own phone (inference that Apple and Google act as controllers: UNVERIFIED, LAW-9) |

**Data flows out of the UK.**

| Flow | Destination | Safeguard |
|---|---|---|
| Push tokens and push text, through Expo | United States [EXPO-PUSH] | Expo relies on the UK Extension to the EU-US Data Privacy Framework (LAW-10). Its live listing and a DPA are UNVERIFIED; F7 confirms both |
| Auth emails, through Resend | Resend stores data in the US (`qa/auth-readiness.md:74-80`) | Resend's DPA, confirmed in F7 |
| Supabase support access | Supabase Pte. Ltd, Singapore, with remote access to the London project | Supabase DPA with the UK Addendum [SUPA-DPA] |
| Link site requests and logs | Vercel's default region is Washington, D.C. (`iad1`); the generated config sets none (`links/generate.mjs:72-103`) | Vercel DPA with the EU SCCs and UK addendum [VERCEL-DPA]; region [[OWNER: Vercel function region — proposed: London (lhr1)]] |
| Phone numbers and codes, through Twilio | [[OWNER: Twilio's region and transfer safeguard, to confirm when Resbite Ltd's account accepts Twilio's Data Protection Addendum — proposed: the United States, Twilio's main processing location, under the UK–US data bridge (Twilio Inc. states it takes part in the UK Extension to the EU–US Data Privacy Framework; check the live listing), with the UK Addendum to the EU Standard Contractual Clauses in Twilio's addendum as the fallback; Twilio's Ireland region (IE1) also offers messaging]] | As left |

**Retention.** The defaults in the gap analysis' section 5 table, enforced by the C3 jobs and the C2 deletion (all **To build** except where marked). The full schedule is A12.

| Data | Kept for |
|---|---|
| Non-users' numbers in `private.phone_invitations` | Until answered or revoked, or 30 days after the resbite ends, whichever comes first |
| Numbers in `private.plan_removals` | 30 days after a one-off ends; 90 days after a series' last occurrence |
| Chat messages | 90 days after a one-off's chat closes; in a group, messages older than 12 months |
| Plans, guest rows, meeting details, join requests, co-hosts, mutes | 12 months after a one-off ends, or after a series' last occurrence |
| Notification outbox and delivery rows | 30 days after sending (`invited` rows while the invitation is pending) |
| Replaced profile photos and covers | 7 days unattached |
| Closed reports | 180 days after closing (decided, R-Q3; run by hand today, by a C3 job at 1.0) |
| Suspension records | While suspended, then 12 months after it is lifted. If the account is deleted, the user id is cleared and the reason and dates kept for 12 months after the deletion (ruling AS-R1; C2) |
| Reports filed by a person who deletes their account | Until closed, then 180 days, with the reporter id cleared (ruling AS-R2; C2, C3) |
| Web-only accounts | Deleted after 12 months with no resbite; a code request never confirmed, after 30 days (ruling AS-R4; C3) |
| Connections | While both accounts exist or until removed; unanswered requests 90 days |
| Connection refusals | 12 months after the refusal |
| Objection suppression list | Until the person withdraws the objection |
| App sessions, the 18+ and Terms record, blocks | While the account exists (blocks until undone) |
| Test-mode codes and log | Emptied when test mode is switched off; tables dropped after the log review (C1) |
| Link opens | 12 months |
| Backups and Supabase logs | 7 days (Live) |
| Support, request, complaint and law-enforcement records (outside the repo) | 24 months after the case closes |
| Whole account | Deleted in the app within 30 days of the request, for every account type (B3, C2) |

**Security (headline).** Private schema with no grants; reads only through checked functions; private buckets with short signed links; photo metadata removed on the phone; HTTPS everywhere; no third-party scripts on the link site; secrets in function settings, not in the app; MFA on every admin account (F16); 7-day backups; a breach runbook (A17). Details per risk in section 5.

### 2.2 Scope: what data, how much, how often

**Categories of data.** Account and sign-in data (phone number, email, Apple or Google identity, password hash, sessions); profile (display name, optional photo); resbites and taking part; invitations and the numbers of non-users; chat; connections and refusals; blocks and reports; push tokens and delivery records; the 18+ and Terms record; logs and backups; device and browser storage.

**What we no longer collect at 1.0.** The optional date of birth, second phone number, city and interests are removed from Account details and their stored values erased (B11, C9; **To build**). The Wellness tab, which showed sample figures and measured nothing, is hidden (B4; **To build**). The unused location library is removed (B8; **To build**). Contacts no longer reads email fields (B8; **To build**).

**Special category data.** We do not ask for it. It can appear in what people write, for example a chat message or a report that reveals health, religion or sexual orientation. We treat it as part of the content and do not extract or profile it (open point in section 7 for the solicitor).

**Criminal offence data.** Reports can allege offences such as harassment, threats, child sexual abuse or sharing intimate images without consent. These allegations are criminal offence data (DPA 2018 s.11(2)). See R16 and A23.

**Volume.** 14 confirmed accounts on 16 November 2026 (`docs/implementation-status.md:3`). The launch volume is unknown. Lookups are capped at 500 numbers per account per day.

**Frequency.** Continuous: every sign-in, plan, invitation, message and push.

**Geography.** UK storefront only. Users are mainly in the UK; invited non-users may be anywhere, since a host can invite any number.

**People affected.** Users (18+); invited non-users; people named or pictured in content; reporters and reported people; web visitors; the team.

### 2.3 Context

- **Relationship and expectations.** Users choose to join and expect their friends to find them by number: the app says so on Add your number ("Your friends find and invite you by your number.", `mobile/src/domain/phoneCopy.ts:30`). Non-users have no relationship with us; they expect a message from a friend, not a record held by a company.
- **Control.** Users control their profile, their answers, what they write, blocks, mutes and deletion. Non-users control nothing until they open their personal link, where they can answer, and where the notice tells them how to object or ask for deletion (D3).
- **Vulnerable people.** The service is 18+, but age is self-declared (R9). People at risk from someone who knows their number, such as people leaving an abusive relationship, are the group most exposed by discoverability (R1).
- **Prior concerns.** During the beta, phone codes ran in test mode: any number could be signed in with `000000` (SI-1, decision CI-D13). C1 ends this and F5 records the log review as the first breach log entry, whatever it finds (**To build**). Account deletion has not been live (DEL-1); C2 puts it live (**To build**).
- **State of the art.** Messages are not end-to-end encrypted. Group planning apps commonly let later joiners read the history. Contact discovery by number is common in messaging apps and is a known privacy concern.
- **Codes and guidance.** Ofcom's illegal content Codes (A13, A15); the ICO's Children's code (A14); Apple's App Review Guidelines, including 5.1.1(viii) on compiling personal information (R4).

### 2.4 Purposes

| Purpose | Benefit |
|---|---|
| Run accounts and keep them secure | People sign in safely; a verified number makes impersonation harder |
| Let friends find and invite each other by number | The core of the app: invitations reach people without sharing usernames |
| Plan resbites, invite, answer and chat | The service people sign up for |
| Send push notifications about their resbites | People learn about changes and messages in time |
| Keep people safe: blocks, reports, the filter, moderation | Users are protected; we meet the Online Safety Act duties and Apple's guideline 1.2 |
| Answer support, privacy requests and complaints | People can use their rights |
| Meet legal duties: NCA reports, Ofcom notices, police requests | Society's interest in preventing serious harm |
| Keep logs and backups | Security and recovery |

We do not use personal data for advertising, analytics, profiling, marketing or selling.

---

## 3. Step 3: Consultation

| Who | Status | How their view is reflected |
|---|---|---|
| The owner, as controller's decision maker | Done | The owner's decisions and recommended defaults in the gap analysis (D-1 to D-25) |
| The product stakeholder | Done for the 18+ rule (decision GI2-D3) | The 18+ minimum age |
| The backup moderator | To do, when A24 is signed (C5) | Their access and duties are set in A24 and A15 |
| A UK solicitor (D-12) | To do | Reviews this DPIA, A23 and the public documents; summary in section 8 |
| Processors | To do (F7) | Supabase, Expo, Resend, Vercel, Twilio, the CAPTCHA vendor and the mailbox provider confirm their contracts and transfer safeguards |
| Users and invited non-users | **Not done** | No consultation with users is recorded. Recommended before the first yearly review: ask beta users about push previews, discoverability by number and chat history for later joiners, and record the answers here |
| The ICO | Not needed | Prior consultation (Art 36) applies only when a high risk remains after measures. None does (section 6) |

No data protection officer is appointed: the core activities are not large-scale monitoring or large-scale special category or criminal data (Art 37). A8 records the reasons.

---

## 4. Step 4: Necessity and proportionality

### 4.1 Lawful basis

The full register is A8 and A11. In short (from LAW-5, adjusted to the 1.0 target):

| Purpose | Art 6 basis |
|---|---|
| Account, phone verification, profile, plans, invitations to users, answers, chat, groups, connections, service pushes | Contract, Art 6(1)(b) |
| The 18+ and Terms record | Legitimate interests (enforcing the age limit and the Terms), Art 6(1)(f) |
| Contact lookup on picked numbers | Legitimate interests, Art 6(1)(f), with an LIA (A10) |
| Storing a non-user's number for a personal invitation, and a removed person's number per series | Legitimate interests, Art 6(1)(f), with an LIA (A10) |
| The objection suppression list | Legitimate interests, Art 6(1)(f), with an LIA (A10, LI-4); the solicitor may prefer legal obligation, Art 6(1)(c) with Art 21 |
| Reports, blocks, filter, suspensions, moderation | Legal obligation for the Online Safety Act duties, Art 6(1)(c); legitimate interests for enforcing the Terms beyond them |
| Disclosures to police or the NCA | Legal obligation for CSEA reports; recognised legitimate interest (crime, safeguarding, emergencies) for other disclosures (A22) |
| Link-open counts, security logs, rate limits, backups | Legitimate interests |

**Criminal allegations in reports** need an Art 10 condition from DPA 2018 Schedule 1: [[OWNER: the DPA 2018 Schedule 1 condition for criminal offence data in reports, chosen with the solicitor — proposed: paragraph 12 (regulatory requirements relating to unlawful acts), with paragraph 10 (preventing or detecting unlawful acts) as the alternative, each extended to criminal offence data by paragraph 36; paragraph 18 (safeguarding) for child-safety reports; paragraph 33 (legal claims) for records under a legal hold]].

### 4.2 Does the processing achieve the purpose, and is there a less intrusive way?

| Choice | Why it is needed | Less intrusive options weighed |
|---|---|---|
| **A verified phone number on every account** | Friends invite each other by number, and a verified number ties an account to a real phone (SI-5) | Usernames or email invitations: rejected, because the product works on the numbers people already have. The number is never shown to other users |
| **Matching picked numbers against users' numbers** | Tells the host who can get an in-app invitation and who needs a link | Upload the whole address book: rejected, never done. Hashing numbers before sending: rejected as no real protection (the space of phone numbers is small enough to reverse a plain hash, and Apple counts hashed numbers as collected). Only the numbers the user picks are sent, and only the day's count is kept |
| **Storing a non-user's number** | The personal link must check that the person answering holds the invited number (`private.answer_phone_invitation`, `supabase/migrations/20261111130000_circles_of_trust.sql:461-475`) | Store a keyed hash instead of digits: possible, but the host's list shows the numbers they invited, and the invitation is deleted on a short schedule. Recorded as a later option in section 7 |
| **Keeping a removed person's number per series** | Stops a guest bringing back, by number, someone a host removed (circles of trust) | Keep only account ids: would not stop a guest re-inviting a non-user's number. Kept short: 30 or 90 days (C3) |
| **Chat history for later joiners** | A group chat is useful only if people who join can see the plans already made | Show only messages after joining: not built. Measures in R7 |
| **Message text in push previews** | People respond in time | Generic pushes: weighed; the owner's default keeps previews and discloses them (D-13), with a "hide previews" setting after 1.0 (B15) |
| **Team access to all content** | The moderation scripts write, and the only Supabase role on the Pro plan short of Owner that can run them has full content access [SB-ACCESS] | A narrow moderation tool, or the Team plan's read-only and project-scoped roles: recorded as later options (R11) |

### 4.3 Minimisation

- The address book is never uploaded. Only picked numbers leave the phone, as digits, at most 50 per call and 500 per day; names never leave the phone (DI §12).
- The lookup returns only which numbers belong to users, not names or profiles. It stores no record of the lookup, only the day's count (`supabase/migrations/20261028120000_contact_invitations.sql:30-61`).
- No device location. Places are free text the host types (R14).
- Photos are resized to 1024 px, re-encoded as JPEG and stripped of metadata on the phone before upload (`mobile/src/services/photo.ts:51-90`).
- Pushes never carry the place, meeting details, description, note text or cover description (`supabase/functions/_shared/notification-copy.ts:1-8`). A moderator's push says only "A new report is waiting." (`:167`).
- The daily report read shows no phone number and no email (`supabase/ops/open-reports.sql:1-26`).
- The optional profile fields, the Wellness tab, the location library and Contacts email fields are removed (section 2.2; **To build**: B4, B8, B11, C9).
- No analytics, crash reporting or advertising SDK (D-15).

### 4.4 Accuracy

The sign-in number is verified by an SMS code (once C1 ends test mode). A frozen copy keeps the exact words of a reported message (`supabase/migrations/20261111160000_chat_safety.sql:763-780`). People correct their name and photo in the app; a change of number or email is handled by request through the privacy inbox for 1.0 (SI-9, A16).

### 4.5 Transparency

- The Privacy Policy (A1) at https://link.resbite.com/privacy, linked from the app's "About and legal" group, the welcome and sign-in screens, the 18+ tick, the link site footer and the App Store listing (B1, D1, D2; **To build**). It discloses discoverability, chat history, push text through Expo in the US, connections and refusals, non-users' numbers, reports, retention and vendors.
- A short notice beside the number field on `/r/` and `/i/`, and on `/i/` a **separate** statement of the right to object (A2, D3, PRV-19; **To build**).
- An accurate Data & privacy page in the app (B5; **To build**).
- In the chat itself: "To: people going. People who join later can read this too." (`mobile/src/domain/chatCopy.ts:22`) and "made this a group · everyone invited can read this chat" (`mobile/src/domain/chatRules.ts:294`) (**Live**).
- The contacts purpose string will say that picked numbers are checked with the server (B8; **To build**).

### 4.6 Rights

- Deletion in the app for every account type, completed within 30 days, with a confirmation (B3, C2; **To build**). Suspended accounts can delete too (D-19). Banned and web-only accounts use the privacy inbox route on `/delete-account` (A6, D8), and the owner runs the deletion script that follows the app's lifecycle (ruling AS-R3, C6). A web-only account with no resbite in 12 months is deleted by a job (ruling AS-R4, C3).
- Access and portability by request, with a "Request a copy of my data" row (B14) and an export script that gives the person's own messages, never other people's chat or a reporter's identity (C6, A16; **To build**).
- Objection: a non-user's objection is honoured across all hosts by the suppression list (C3, D-23; **To build**).
- Complaints to us first (DPA 2018 s.164A), then to the ICO (A5).

### 4.7 Processors and transfers

Every vendor, its role, region, contract and transfer test is in A18. The open items are Expo's DPA and live Data Privacy Framework listing (UNVERIFIED), the scope of Vercel's DPA for the plan in use (UNVERIFIED), Twilio's contract, region and message retention before switch-on (A18), the CAPTCHA vendor's terms, and moving every vendor account into the company's name (F7, F8; **To build**).

### 4.8 Stopping function creep

- No marketing pushes or emails; every push is a service message about the person's own resbites (LAW-24).
- No operator-sent messages to non-users; the host sends from their own phone with neutral text they can edit (`mobile/src/domain/contactInvites.ts:190-195`).
- Non-users' numbers are used only for the invitation or removal they belong to, never joined across hosts, never shown to other users, never exported.
- Any new purpose, analytics, crash SDK or vendor triggers a review of this DPIA (section 9).

### 4.9 Apple guideline 5.1.1(viii)

The guideline: "Apps that compile personal information from any source that is not directly from the user or without the user's explicit consent, even public databases, are not permitted." [ARG 5.1.1(viii)]. Our assessment is in R4. In short: Resbite does not compile a database of people. Each stored number belongs to one host's invitation or one series' removal, entered one at a time by a user acting for themselves, used only for that, and deleted on a short schedule. The suppression list holds only numbers whose holders asked us to stop, so it comes directly from them. The App Review notes explain this (A7, E6).

---

## 5. Step 5 and Step 6: Risks and measures

Each section says what happens (checked in the code), the risks, the measures with their status, and the residual risk. The summary tables are in section 6.

### 5.1 Data matching in the contact lookup

**What happens.** When a user taps to choose phone contacts, the app asks for Contacts permission and reads one page of 50 contacts at a time into memory (`mobile/src/services/contacts.ts:28-50,119-129`). When the user picks numbers, the app sends only those numbers, as plain digits, to `contacts_on_resbite`. The function normalises each number, compares it and its known equivalent forms with the confirmed numbers of users who are eligible, have used the app and have a profile, and returns the digits that match. It never matches the caller, and never returns someone who has blocked the caller. It allows 50 numbers per call and 500 per account per day, shared with invitations, and keeps only the day's count (`supabase/migrations/20261111160000_chat_safety.sql:729-745`; `supabase/migrations/20261028120000_contact_invitations.sql:30-61`). When the host then invites an "On Resbite" number, the person is added as a pending guest and gets a notice, and the host can see their display name and photo on the guest list.

**R1. Anyone who has your number can learn that you use Resbite, and by inviting you can see your display name and photo.**
- Source: the lookup and in-app invitation by number. Impact: someone you have cut off, such as an abusive former partner, can confirm you are on Resbite and see the name and photo you chose; you receive an unwanted invitation.
- Before measures: possible × significant = **medium**.
- Measures:
  - Block, which removes you from that person's lookups and stops their in-app invitations (`supabase/migrations/20261111160000_chat_safety.sql:741`, and the `private.blocks` check in `invite_contacts`). **Live.**
  - Nothing beyond a display name and an optional photo is shown; the number and email are never shown to other users. **Live.**
  - Report, with the support route for people at risk (A15). **Live** (report); **To build** (new reasons B7, C7).
  - Disclosure in the Privacy Policy and on Data & privacy (A1, B5). **To build.**
- Options weighed: a setting to hide yourself from lookups. Not offered for 1.0, because being findable by number is the core of the app; recorded as an open point (section 7).
- Residual: possible × minimal-to-significant, rated **medium**. Accepted, because it is the core function, people are told, and block works.

**R2. Someone uses the lookup to work out which of many numbers belong to users (enumeration).**
- Source: scripted lookups. Impact: a list of Resbite users' numbers for spam or targeting.
- Before measures: possible × significant = **medium**.
- Measures:
  - 50 numbers per call and 500 per account per day, shared with invitations. **Live.**
  - Only a confirmed, eligible account with a verified number can call it. **Live** (eligibility); verified numbers once test mode is off (C1, **To build**).
  - CAPTCHA on sign-up and sign-in, switched on after the build and the site send its token (B16, D10, C11, F14; [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]]). **To build.**
  - The restored SMS rate limit and the `/i/*` firewall rule (C1, D5, F14). **To build.**
  - Suspension of abusing accounts (A15). **Live** (script).
- Residual: remote × significant = **low**.

### 5.2 Invisible processing of non-users' numbers, and `plan_removals`

**What happens.**
- **Lookup only.** A picked number that matches nobody is compared and forgotten. Its holder never learns of it. We rely on the public Privacy Policy (Art 14(5)(b)), which is why the ICO treats this as invisible processing.
- **Personal invitation.** When a host, or a guest the host lets bring people, invites a number that belongs to no user (or to someone who has never used the app, or who blocked the inviter), the server stores the digits and calling code in `private.phone_invitations`, with only a hash of the link's code, who sent it and when (`supabase/migrations/20261111160000_chat_safety.sql:672-715`). The sender's phone opens WhatsApp or Messages with a neutral text they can edit: "{host} invited you to {title}, {when}. Reply here: {link}" (`mobile/src/domain/contactInvites.ts:190-195`). The holder first hears from us when they open the link. To answer, they must prove the number with an SMS code; the server refuses anyone whose verified number differs (`supabase/migrations/20261111130000_circles_of_trust.sql:470-475`). Wrong-number checks are limited to 10 per invitation per hour (`supabase/migrations/20261028120000_contact_invitations.sql:222-240`).
- **Removals.** When a host removes, declines or revokes someone, the number (and the account, if any) goes into `private.plan_removals` for the series, so a guest cannot bring them straight back; a host inviting them again clears it (`supabase/migrations/20261111130000_circles_of_trust.sql:38-56,186-190,770-777`).
- Today neither table has an expiry (`supabase/migrations/20261028120000_contact_invitations.sql:12-25`). C3 adds the jobs.

**R3. People whose numbers are processed are not told, or not told in time, and lose control.**
- Impact: unexpected processing by a company they never dealt with; no chance to object before it happens.
- Before measures: probable × minimal = **medium**.
- Measures:
  - A non-user section in the Privacy Policy: the source ("a friend who uses Resbite"), the purpose, the retention and the right to object (A1, A2). **To build** (D1).
  - A short notice beside the number field on `/i/` and `/r/`, and on `/i/` the right to object in its own separate line (D3, PRV-19). **To build.**
  - Short retention, so a number whose holder never opens the link is gone within 30 days of the resbite ending (C3). **To build.**
  - We never contact non-users ourselves; the host sends from their own phone (PERM-4, LAW-23). **Live.**
- Open point: whether the host's invitation text should carry a short privacy line so the notice arrives with the first communication (Art 14(3)(b)); for the solicitor (section 7).
- Residual: possible × minimal = **low**.

**R4. Numbers are kept too long, reused, or build up into a database of people who never signed up (guideline 5.1.1(viii)).**
- Impact: a growing list of non-users' numbers, linkable across hosts; App Review rejection.
- Before measures: possible × significant = **medium**.
- Measures:
  - Each number is held only inside one invitation (unique per resbite and number) or one series' removal; the code never joins these across hosts, never shows a non-user's number to anyone but the host who invited it, and never exports it. **Live.**
  - Both tables are in the private schema with no grant to any app or web role (`supabase/migrations/20261028120000_contact_invitations.sql:27-28`; `supabase/migrations/20261111130000_circles_of_trust.sql:55-56`). **Live.**
  - Retention: invitations until answered or revoked, or 30 days after the resbite ends; removals 30 days after a one-off ends and 90 days after a series' last occurrence (C3). **To build.**
  - The App Review notes explain that numbers serve only the host's own invitation and are deleted on a schedule (A7, E6). **To build.**
- Our view on 5.1.1(viii): the guideline targets apps that assemble profiles of people from other sources. Resbite stores a number only because a user, acting for themselves, chose to invite that one person or to keep that one person out of their own series, and keeps it only for that. `plan_removals` is the closest case, because it holds the number of someone a host turned away; it is kept per series, never used for anything else, and deleted 30 or 90 days after the resbite or series ends. Whether App Review shares this reading is a judgement (UNVERIFIED).
- Residual: remote × significant = **low**.

**R5. A non-user who objects keeps being invited by other hosts.**
- Impact: an objection that does not work; repeated unwanted invitations.
- Before measures: probable × minimal = **medium** (deleting one invitation row does not stop the next host).
- Measures:
  - The suppression list: a keyed hash of the objecting number, checked by `invite_contacts`, so no host can store or link that number again; kept until the person withdraws the objection (C3, D-23). **To build.**
  - The objection route on `/i/` and through the privacy inbox (D3, A16). **To build.**
- Residual: remote × minimal = **low**.

**R6. The wrong person receives an invitation (a mistyped, outdated or recycled number).**
- Impact: a stranger sees the host's display name, the title, time, optional area and cover on the personal page.
- Before measures: possible × significant = **medium**.
- Measures:
  - The personal page shows no exact place, no meeting details and no guest list. **Live.**
  - Answering needs the invited number verified by SMS code; a forwarded link is useless to anyone else. **Live** (check); real SMS once C1 is done (**To build**).
  - The host can revoke the link. **Live.**
  - The page tells the holder how to object or ask for deletion (D3). **To build.**
- Residual: possible × minimal = **low**.

### 5.3 Open-link joiners and later joiners reading chat

**What happens.** Membership of a chat is computed, never stored (`supabase/migrations/20261111150000_chat_groups.sql:194-205`):
- **One-off resbite:** the hosts and the guests who answered Going or Maybe read and write the whole history. The chat goes read-only 48 hours after the end.
- **Weekly group:** the hosts and everyone invited to the current occurrence, **whatever they answered, pending guests included**, read and write the whole history. Ruling AS-R8 keeps this as built (`supabase/migrations/20261111150000_chat_groups.sql:194-205`) and discloses it; it is still to confirm with the owner. It closes 48 hours after the series stops. Someone who leaves after an occurrence has ended is out of the chat.

People get into a resbite in four ways: a host's invitation; a personal link answered with the matching verified number; the open event link (`/r/`), where every request waits for a host's approval (`supabase/migrations/20261029120000_open_link_approval.sql:1-8`); and a guest bringing someone, which needs no approval but only works when the host has given guests invites (`bring_invites`, default 0, "Nobody", up to 3) (`supabase/migrations/20261111130000_circles_of_trust.sql:15-21`).

**R7. Messages written for a small group are read by people who join later, including people a host approved from a forwarded link or a guest brought.**
- Impact: personal details in earlier messages reach people the writer did not have in mind; names and photos of the others reach them too.
- Before measures: probable × significant = **high**.
- Measures:
  - Host approval for every open-link request. **Live.**
  - Bringing is off unless the host turns it on, and limited to 3 people per guest and 3 levels. **Live.**
  - The host can reset the event link so the old one stops working (`private.rotate_plan_link`, `supabase/migrations/20261021120000_gi1_event_links.sql:51-58`), and remove a guest. **Live.**
  - The chat says that later joiners can read it, and a group says that everyone invited can read it. **Live.**
  - Data & privacy and the Privacy Policy say that chat is readable by later joiners and, in a weekly group, by everyone on the current week's guest list, pending guests included, and that it is not end-to-end encrypted (B5, A1; ruling AS-R8). **To build** (rewrite).
  - Report, block, delete your own message; a host can remove a message. **Live.**
  - One-off chats close 48 hours after the end; chat retention of 90 days after closing, or 12 months in a group (C3). **Live** (closing); **To build** (retention).
- Options weighed: show only messages sent after a person joined. Not built; it would break the shared plan that makes a group chat useful. Recorded for review.
- Residual: possible × significant = **medium**. Accepted: it is how the product works, people are told in the chat itself, and hosts control who joins.

**R8. Strangers with a forwarded event link see a resbite's public details and ask to join.**
- Impact: the host's name, the title, time, optional area and cover reach people outside the group.
- Before measures: possible × significant = **medium**.
- Measures:
  - The public page shows no exact place, no meeting details, no guest names and no chat (`supabase/migrations/20261031120000_creating_a_resbite.sql:247-264`). **Live.**
  - The area is optional and limited to 80 characters (`supabase/migrations/20261021120000_gi1_event_links.sql:85`). **Live.**
  - Every request needs the host's approval; the link can be reset. **Live.**
  - Pages are `noindex` with no referrer and no third-party scripts (`links/generate.mjs:9-16,106`). **Live.**
- Residual: possible × minimal = **low**.

### 5.4 Reliance on self-declared age

**What happens.** Resbite is for people aged 18 and over. Age is a tick, "I'm 18 or over" (`mobile/src/domain/guestAccount.ts:12-15`). Today the tick appears only on phone sign-up and the in-app invitation flow, and on the link site (SI-7). At 1.0, every account, old and new, must accept the current Terms version with the 18+ tick on one screen before using the app, in the app and on the web alike (B2, C8, D4; decision D-11). A verified phone number is required on every account. The App Store rating is set to 18+ (E4).

**R9. Children use the service, and adults use it to contact or meet them.**
- Impact: children's data processed without the protections the Children's code expects; at worst, grooming or physical harm at a meet-up.
- Before measures: possible × severe = **high**.
- Measures:
  - The 18+ tick and the Terms on every account, enforced the same way for everyone (B2, C8, D4). **To build.**
  - App Store age rating 18+ with the honest questionnaire answers (E4). **To build.**
  - No date-of-birth field, so no stored under-18 date contradicts the rule (B11, C9). **To build.**
  - A "Child safety" report reason, and the under-18 rule in A15: reasonable grounds, suspend, ask for no more proof than is proportionate, delete the account and its data, and record the case for A14's yearly review (B7, C7, A15). **To build.**
  - The CSEA path: preserve, report to the NCA, suspend and ban, never forward the content (A15, F2). **To build.**
  - No public discovery of strangers: no search, no public profiles, no location; new contacts come only from a number, a host's approval or a guest the host trusts. **Live.**
  - The children's access assessment, reviewed yearly (A14, F15). **To build.**
  - Whether the UK is a region where Apple requires its Declared Age Range check is asked of Apple or the solicitor before submission; if it is, it is built for 1.0 (D-16, ASC-17; UNVERIFIED). **To do.**
- Residual: possible × significant = **medium**. Accepted, with A14's evidence and yearly review. If A14 finds children are likely to access the service, this DPIA is reopened.

### 5.5 Push text sent through Expo in the United States

**What happens.** The sender job builds each push and posts it to Expo's push service at `exp.host` (`supabase/functions/_shared/notification-adapters.ts:16`), which passes it to Apple's push service and the device. A chat push carries the resbite's title as heading and, as body, the sender's first name (cut at 30 graphemes) and the message (cut at 120 graphemes); an announcement reads "Announcement from {first name}: {words}" (`supabase/functions/_shared/notification-copy.ts:100-165`). Other pushes carry the title, the display name of the person who acted (`supabase/migrations/20261111140000_chat_core.sql:754`) and the time. No push carries the place, meeting details, description, note text or cover description. Expo is hosted in the US [EXPO-PUSH] and says it deletes push payloads after handing them on and keeps receipts for 24 hours (LAW-9; DI §8). Decision D-13 keeps previews and discloses them.

**R10. Message text and first names leave the UK and appear on lock screens.**
- Impact: a US processor handles message text; someone nearby reads a preview on a locked phone.
- Before measures: probable × minimal = **medium**.
- Measures:
  - Text is cut at 120 graphemes and first names at 30; sensitive fields never go in a push. **Live.**
  - The moderator's push carries no report content. **Live.**
  - Users can mute a chat or a resbite in the app (`public.chat_mutes`, `public.plan_mutes`), and iOS lets them hide previews on the lock screen. **Live.**
  - Disclosure in the Privacy Policy and Data & privacy (A1, B5). **To build.**
  - Expo's DPA and Data Privacy Framework listing confirmed and recorded in A18 (F7). **To build.**
  - A "hide message previews" setting after 1.0 (B15). **Later.**
- Options weighed: generic pushes ("New message"), or payloads encrypted on the server and decrypted on the phone by a notification service extension. Not for 1.0 (D-13).
- Residual: possible × minimal = **low**, once F7 confirms Expo's safeguard.

### 5.6 Who can read chats

**What happens.**

| Who | Access to chat | How |
|---|---|---|
| Chat members | The whole history of chats they are in | Database functions that call `private.chat_member` |
| Former members | Nothing after they leave or are removed | Membership is computed from the current occurrence |
| Expo and Apple | The first 120 graphemes of each message, in pushes | Section 5.5 |
| Supabase (processor) | Technically everything, under its DPA | [SUPA-DPA] |
| The owner | Everything | Supabase Owner role; SQL editor |
| The backup moderator | Everything | Supabase **Developer** role, the lowest role on the Pro plan that can run the moderation scripts, which write; it has full content access. Read-only and project-scoped roles need the Team plan [SB-ACCESS] (PRV-17, C5) |

Messages are not end-to-end encrypted. Moderation needs only the report queue (`supabase/ops/open-reports.sql`), which shows each report's reason, the reporter's own words, the frozen copy of the reported message, the two display names and the resbite, and no phone or email. Removing a message blanks its words and leaves the report open (`supabase/ops/remove-reported-message.sql:1-13`).

**R11. Someone on the team reads private chats, numbers or reports beyond what moderation needs, or their account is taken over.**
- Impact: a serious intrusion into private conversations; exposure of numbers and meeting places.
- Before measures: possible × severe = **high**.
- Measures:
  - Only two people have access: the owner and one named backup moderator [[OWNER: the backup moderator's identity — the owner names one backup (decision AS-D6); recorded only in the signed team access agreement kept outside the repo; the repo records only that a backup is named, and the date — proposed: at the Supabase Developer role with MFA, named before the 1.0 submission]] (D-6, AS-D6, C5). **To build.**
  - Written instructions and a confidentiality agreement (A24): open data only to handle a report, a data request, a legal request or a breach; read the report queue, not whole chats; make no copies; no exports outside the scripts. Signed before access. **To build.**
  - MFA on Supabase and every other admin account (F16). **To build.**
  - An access review every six months and an offboarding checklist (F16). **To build.**
  - The daily read shows no phone or email. **Live.**
  - The team's actions are recorded on the report (status, action, note, time) (`supabase/ops/close-report.sql:1-12`). **Live.**
- Options weighed: the Team plan's read-only role (it could not run the scripts that write); a narrow moderation tool that shows only the report queue and runs the scripts. Recorded as later options.
- Residual: remote × severe = **medium**. Accepted for 1.0 with A24, MFA and reviews.

The remaining chat risks (a breach, no end-to-end encryption) are R19.

### 5.7 Reused phone numbers

**What happens.** Most accounts sign in with a phone code alone: sign-up starts at `/auth/phone` (`mobile/app/auth/index.tsx:50`), and sign-in asks Supabase Auth to text a code to the number, then verifies it (`mobile/src/services/phoneCode.ts:33-79`). A carrier can give a dormant number to a new customer (an inference; how often UK carriers recycle numbers is UNVERIFIED). Lookups and invitations match by number, so a recycled number still points at the old owner's account. If someone tries to add a number another account holds, the app says "This number already belongs to another Resbite account. Use a different number, or ask the Resbite team for help." (`mobile/src/domain/phoneCopy.ts:33`).

**R12. The new holder of a recycled number signs in to the old owner's account.**
- Impact: access to the old owner's chats, plans, places and connections; impersonation towards their friends.
- Before measures: possible × significant = **medium**.
- Measures:
  - Retention limits what is left in a dormant account: one-off chats close 48 hours after the end and are deleted 90 days later, group messages after 12 months, plans after 12 months (C3). **Live** (closing); **To build** (deletion).
  - A support route for "this isn't my account" and "I changed my number": the privacy inbox and A16 (number changes by request for 1.0, SI-9). **To build** (inbox F1, procedure A16).
  - The Terms ask people to tell us when they lose or change their number (A3). **To build.**
  - Accounts that also use email and password, Apple or Google keep another way in, so the old owner can still sign in, notice the problem, and delete the account or tell us. **Live.**
  - The support address on the taken-number line (B6). **To build.**
- Options weighed: a second check for long-dormant accounts (for example, ask for the email or Apple sign-in when the last session is old). Not in any workstream for 1.0; the gap analysis accepts this risk for 1.0 with a recorded reason (its section 7). Open point in section 7.
- Residual: possible × significant = **medium**. Accepted for 1.0, reviewed yearly.

**R13. Invitations meant for the new holder reach the old owner's account.**
- Impact: a host's resbite, including the exact place, reaches the old owner, a stranger to the host.
- Before measures: possible × significant = **medium**.
- Measures:
  - The host sees the matched account's display name on the guest list and can remove them; meeting details go only to Going or Maybe. **Live.**
  - Number changes by request (A16), so owners can keep numbers current. **To build.**
  - Retention and in-app deletion clear abandoned accounts' data (C2, C3). **To build.**
- Residual: remote × significant = **low**.

### 5.8 Location: only a place the user chooses

**What happens.** Resbite never reads the phone's location. `expo-location` is installed and configured but never imported (`mobile/app.json:57-65`; no import in `mobile/app` or `mobile/src`), and B8 removes it. The place is free text the host types (`plans.place_label`), which may be a home address. The latitude and longitude columns exist but the app never sends them. A tap on the place opens Apple Maps with the text (`mobile/src/domain/eventView.ts:186-197`). An optional public area of up to 80 characters is shown on the link page. Private meeting details (up to 2,000 characters) go only to guests who answered Going or Maybe. When a host's account is deleted, the places on their resbites are cleared, the redaction trigger blanks their titles, descriptions, covers, notes to guests, meeting details and areas (`supabase/migrations/20261021120000_gi1_event_links.sql:188-203`), and future resbites are cancelled with a push to guests (`supabase/migrations/20261116120000_open_beta.sql:233-242`; decision D-20). That deletion step is not live yet (C2).

**R14. A meeting place, often a home, and a time reach people who should not have them, and someone is harmed.**
- Impact: physical risk to the host or guests; burglary while away.
- Before measures: possible × severe = **high**.
- Measures:
  - No device location at all; the location library and its purpose strings are removed (B8). **Live** (no use); **To build** (removal).
  - The exact place goes only to people invited to that resbite, never to the public page or to pushes. **Live.**
  - Door codes and directions sit in meeting details, seen only by Going or Maybe. **Live.**
  - The area on the public page is optional and coarse by design. **Live.**
  - Removing a guest ends their access; the host approves link requests. **Live.**
  - Plans and places are deleted 12 months after the resbite or series ends (C3); a deleted host's places are cleared at once (C2). **To build.**
  - Breach protections (R19).
- Residual: remote × significant = **low**. With access limited to invitees, unintended disclosure becomes remote, and the most likely remaining harm, an unwanted person at the door, is significant rather than severe. A breach of the database, where severity stays severe, is R19.

### 5.9 Photos

**What happens.** A profile photo and a resbite's cover are picked through the system photo picker, resized to 1024 px, re-encoded as JPEG and stripped of metadata (including any GPS position) on the phone (`mobile/src/services/photo.ts:51-90`). Both buckets are private, 2 MB, in London. A profile photo is seen only by people who share a resbite with the person, their connections, and people they have refused but not hidden (`private.can_read_profile`, `supabase/migrations/20261110120000_connections.sql:304-310`). A cover is seen by everyone on the resbite and, through the link site's image route, by anyone with the event or personal link (`links/server/api/image.mjs:55-68`). Images are not scanned. Today replaced photos and covers stay in storage (DI §10).

**R15. Photos are used for abuse: an intimate image shared without consent, impersonation, or a photo of someone who never agreed.**
- Impact: severe distress; an offence (intimate image abuse, cyberflashing).
- Before measures: possible × severe = **high**.
- Measures:
  - Metadata removed before upload; private buckets; signed links of 300 seconds. **Live.**
  - An "Intimate image shared without consent" report reason in the app (B7, C7) and a web route that non-users can use (D1, UGC-9). **To build.**
  - The 48-hour intimate image takedown, applied from launch whatever the commencement date (D-21, A15), with scripts that remove a profile photo or a cover fast (C6). **To build.**
  - Suspension of the uploader; suspension by account id (C6). **Live** (by report); **To build** (by id).
  - Replaced photos and covers deleted after 7 days unattached (C3, orphan photo cleanup). **To build.**
  - A line in the Terms (A3). **To build.**
- Options weighed: hash-matching against known intimate images. Not for 1.0 (D-21): images are limited to profile and cover photos in small private groups; the reasons are recorded in A13 and reviewed yearly.
- Residual: possible × significant = **medium**. Accepted with the yearly review.

### 5.10 Cross-cutting risks

**R16. Reports hold allegations of offences, and a reported person learns who reported them.**
- What happens: each report keeps the reporter, the reported person, the reason, up to 500 characters of the reporter's words, a frozen copy of the reported message and its author, and the team's note and action (`supabase/migrations/20261111160000_chat_safety.sql:763-780`). Closed reports are deleted 180 days after closing; closing forgets who a report was about once that account is gone or being deleted (`supabase/ops/close-report.sql:1-12`, `supabase/ops/purge-closed-reports.sql:1-8`).
- Before measures: possible × significant = **medium**.
- Measures:
  - An Art 10 condition and, if it needs one, the appropriate policy document (A23, D-22). **To build** (solicitor).
  - Reports are readable only by the team's scripts (no grant to any role, not even `service_role`). **Live.**
  - Subject access never discloses the reporter's identity or other people's messages (A16; export script C6). **To build.**
  - 180-day retention by a scheduled job (C3) and a legal hold that pauses it (C2, C3, C6, A22). **To build.**
- Residual: remote × significant = **low**.

**R17. Phone verification is bypassed, or the SMS and CAPTCHA vendors mishandle numbers.**
- What happens today: test mode accepts `000000` for any number (SI-1). At 1.0 Twilio sends the codes through Supabase's Send SMS hook (decision AS-D5; C1, B12, D6), and CAPTCHA protects the code requests (OPS-9).
- Before measures: probable × severe = **high** (today).
- Measures:
  - Test mode off, the test-code tables emptied and later dropped, every session revoked, the log reviewed and recorded in the breach log (C1, F5). **To build.**
  - The `000000` swap removed from the app and the site (B12, D6). **To build.**
  - SMS rate limits restored; OTP length and expiry confirmed (C1, C11). **To build.**
  - CAPTCHA after the build and the site send its token (B16, D10, F14). **To build.**
  - Twilio's DPA before switch-on, with its region and message retention set (A18), and the CAPTCHA vendor's terms; the CAPTCHA script assessed under PECR reg 6 (F7, A18). **To build.**
- Residual: remote × significant = **low**.

**R18. Data is kept longer than needed, or a person cannot get their account deleted.**
- What happens today: almost nothing has a retention period, and account deletion is not live (PRV-7, DEL-1).
- Before measures: probable × significant = **high**.
- Measures:
  - The retention jobs (C3) and the schedule (A12). **To build.**
  - Deletion in the app for every account type within 30 days, including suspended accounts, with Apple token revocation and a confirmation (B3, C2, D-19). **To build.**
  - A request route for banned and web-only accounts (D8, A6, A16). **To build.**
  - A legal hold pauses erasure of the records it names, without blocking the request (C2). **To build.**
- Residual: remote × significant = **low**.

**R19. A breach of the central database exposes numbers, chats, places and reports.**
- Before measures: remote × severe = **medium**.
- Measures:
  - Private schema, row-level security, no grants, reads only through checked functions; Realtime carries no message text. **Live.**
  - MFA on every admin account; secrets only in function settings (F16). **To build** (MFA rule).
  - 7-day backups, a restore rehearsal (F11), and alerts on the jobs (F10). **Live** (backups); **To build** (rehearsal, alerts).
  - Retention keeps less data to lose (C3). **To build.**
  - The breach runbook: the 72-hour test, telling people, the log (A17). **To build.**
- Options weighed: end-to-end encrypted chat. Not for 1.0; it would also stop moderation of reported messages as built.
- Residual: remote × severe = **medium**. Accepted: severity cannot fall without encryption; likelihood is kept remote.

**R20. Connection refusals are a hidden record about a person.**
- What happens: "Not now" answers and removals are kept per resbite; the person asking is not told (`supabase/migrations/20261110120000_connections.sql:35-42`).
- Before measures: possible × minimal = **low**.
- Measures: 12-month retention (C3); disclosure in the notice (A1); deleted with the account (C2); an LIA (A10). **To build.**
- Residual: remote × minimal = **low**.

**R21. Data left on a device or in a browser.**
- What happens: the app keeps its session and some per-account lists in the iOS Keychain, which can survive deleting the app; sign-out clears most of it, and unfinished plan drafts are kept by design (DI §11). The link site keeps a per-invitation session in `localStorage`, including the full verified number, dropped when the event starts or on "Not you? Sign out" (`links/assets/personal-flow.mjs:380-478`).
- Before measures: possible × minimal = **low**.
- Measures: disclosure in the notice and on `/delete-account` (A1, A6); the storage is strictly necessary under PECR (A20). **To build** (disclosure).
- Residual: remote × minimal = **low**.

---

## 6. Summary tables

### 6.1 Step 5: risks before measures

| # | Risk | Likelihood | Severity | Overall |
|---|---|---|---|---|
| R1 | Discoverability by number; name and photo seen by inviting | Possible | Significant | Medium |
| R2 | Enumeration of users' numbers | Possible | Significant | Medium |
| R3 | Non-users not told, or not in time | Probable | Minimal | Medium |
| R4 | Non-users' numbers kept, reused or compiled (5.1.1(viii)) | Possible | Significant | Medium |
| R5 | An objection not honoured across hosts | Probable | Minimal | Medium |
| R6 | The wrong person gets an invitation | Possible | Significant | Medium |
| R7 | Later joiners read earlier messages | Probable | Significant | High |
| R8 | Forwarded links show public details | Possible | Significant | Medium |
| R9 | Children use the service; adults reach them | Possible | Severe | High |
| R10 | Push text to the US and on lock screens | Probable | Minimal | Medium |
| R11 | Team access beyond need, or a team account taken over | Possible | Severe | High |
| R12 | Account takeover through a recycled number | Possible | Significant | Medium |
| R13 | Invitations reach a recycled number's old owner | Possible | Significant | Medium |
| R14 | Meeting place and time reach the wrong people | Possible | Severe | High |
| R15 | Photo abuse, including intimate images | Possible | Severe | High |
| R16 | Criminal allegations in reports; reporter exposed | Possible | Significant | Medium |
| R17 | Phone verification bypassed; vendor misuse | Probable | Severe | High |
| R18 | Kept too long; deletion impossible | Probable | Significant | High |
| R19 | Breach of the central database | Remote | Severe | Medium |
| R20 | Connection refusals as a hidden record | Possible | Minimal | Low |
| R21 | Data left on a device or in a browser | Possible | Minimal | Low |

### 6.2 Step 6: measures and residual risk

| # | Main measures (status) | Effect | Residual | Approved |
|---|---|---|---|---|
| R1 | Block (Live); minimal profile (Live); disclosure (A1, B5: To build) | Reduced | Medium, accepted | At sign-off |
| R2 | Rate limits (Live); CAPTCHA (B16, D10, F14); SMS limit and `/i/*` rule (C1, D5) | Reduced | Low | At sign-off |
| R3 | Notice on `/i/` and `/r/` with a separate objection line (D3); A1 section (D1); retention (C3) | Reduced | Low | At sign-off |
| R4 | Per-invitation records, no grants (Live); retention (C3); review notes (E6) | Reduced | Low | At sign-off |
| R5 | Suppression list (C3, D-23); objection route (D3, A16) | Reduced | Low | At sign-off |
| R6 | SMS proof to answer (Live; C1); no place on the page (Live); objection route (D3) | Reduced | Low | At sign-off |
| R7 | Host approval, bring off by default, link reset, in-chat notices (Live); disclosure (B5, A1); retention (C3) | Reduced | Medium, accepted | At sign-off |
| R8 | Public page limited (Live); host approval (Live); `noindex` (Live) | Reduced | Low | At sign-off |
| R9 | Terms and 18+ on every account (B2, C8, D4); 18+ rating (E4); no date of birth (B11, C9); child-safety reason and rule (B7, C7, A15); A14; D-16 question | Reduced | Medium, accepted | At sign-off |
| R10 | Cut text, no sensitive fields (Live); mutes (Live); disclosure (A1, B5); Expo safeguard (F7) | Reduced | Low | At sign-off |
| R11 | Two people only (C5); A24; MFA and reviews (F16); no phone or email in the queue (Live) | Reduced | Medium, accepted | At sign-off |
| R12 | Retention (C3); support route (F1, A16); Terms line (A3); taken-number contact (B6) | Reduced | Medium, accepted | At sign-off |
| R13 | Host sees the name (Live); number changes by request (A16); retention (C2, C3) | Reduced | Low | At sign-off |
| R14 | No device location (Live; B8); place only to invitees, meeting details to Going or Maybe (Live); retention (C2, C3) | Reduced | Low | At sign-off |
| R15 | Metadata removed (Live); image report reason and web route (B7, C7, D1); 48-hour takedown (A15, C6); photo cleanup (C3) | Reduced | Medium, accepted | At sign-off |
| R16 | Art 10 condition and A23; no grants (Live); reporter withheld (A16, C6); retention and legal hold (C2, C3, C6) | Reduced | Low | At sign-off |
| R17 | Test mode off (C1, B12, D6, F5); CAPTCHA (B16, D10, F14); vendor contracts (F7) | Reduced | Low | At sign-off |
| R18 | Retention jobs (C3); deletion for every account (B3, C2, D8) | Reduced | Low | At sign-off |
| R19 | Private schema, no grants (Live); MFA (F16); backups (Live); rehearsal and alerts (F10, F11); A17 | Reduced | Medium, accepted | At sign-off |
| R20 | Retention (C3); disclosure (A1); deletion (C2) | Reduced | Low | At sign-off |
| R21 | Disclosure (A1, A6) | Accepted | Low | At sign-off |

---

## 7. Open points

For the owner:
1. **A "don't let people find me by number" setting** (R1). Not offered for 1.0. Decide at the first yearly review.
2. **A second check for long-dormant accounts** (R12), for example asking for the email or an Apple or Google sign-in when the last session is old. Not in any workstream; accepted for 1.0.
3. **A narrow moderation tool or the Team plan** (R11), so the backup moderator does not need full content access.
4. **Storing non-users' numbers as a keyed hash** rather than digits (R4). Possible, but the host's own list shows the numbers they invited.
5. **Suspension records and deletion.** Decided by ruling AS-R1: the record of an account that deletes itself while suspended is kept for 12 months after the deletion, with the user id cleared and the reason and the dates kept. In the code, `private.suspensions` is deleted with the Auth user (`on delete cascade`, `supabase/migrations/20261111160000_chat_safety.sql:794-795`), so C2 must build it. Likewise, a deleted reporter's reports are kept until closed and then 180 days, with the reporter id cleared (ruling AS-R2; today `supabase/migrations/20261116120000_open_beta.sql:255` deletes them).
6. **Consult users** (section 3) before the first yearly review.

For the solicitor (gathered with the other documents' questions in `docs/legal/README.md`, "Questions for the solicitor", decision AS-D7):
7. **The Art 10 condition** for reports (D-22), and whether A23 is needed.
8. **Special category data in content and reports** (section 2.2): whether a Schedule 1 condition is needed for what users write about themselves or others, beyond the criminal offence condition.
9. **Art 14(3)(b)**: whether the host's invitation text should carry a short privacy line, since the host's message is the first communication and our notice arrives only when the link is opened (R3).
10. **Guideline 5.1.1(viii)**: whether our reading of `plan_removals` and stored invitations is sound (R4).
11. **No prior consultation** (Art 36): confirm that no residual risk is high.
12. **The regulator's name**: this record follows the gap analysis ("the Information Commission ... ICO"); confirm the form to use.

---

## 8. Step 7: Sign-off and outcomes

| Item | Name, position, date | Notes |
|---|---|---|
| Measures approved by | The owner, for Resbite Ltd. [[OWNER: sign-off date — proposed: after the solicitor's review and once every "To build" measure is live]] | Every "To build" measure must be live before submission |
| Residual risks approved by | The owner, for Resbite Ltd. Same date | R1, R7, R9, R11, R12, R15 and R19 accepted at medium, with the reasons in section 5. No high residual risk, so no ICO consultation |
| DPO advice provided | Not applicable: no DPO is appointed (A8) | Advice taken from a UK solicitor instead (D-12) |
| Summary of the solicitor's advice | [[OWNER: summary of the solicitor's advice on this DPIA — proposed: written here after the review, with any advice not followed and the reason]] | |
| Solicitor's advice accepted or overruled by | The owner | If overruled, give reasons here |
| Consultation responses reviewed by | The owner | See section 3 |
| This DPIA will be kept under review by | The owner | Section 9 |

---

## 9. Review

Review this DPIA:
- **before the 1.0 submission**, to confirm every "To build" measure is live and update each status;
- **at least every 12 months** (F15), with the OSA risk assessment (A13) and the children's access assessment (A14);
- **before any of these changes:** a new SMS provider or CAPTCHA vendor; any analytics, crash reporting or advertising SDK; a new storefront (the EU brings A21); device location or maps; a change to the contact lookup, discoverability or chat membership; a "hide previews" setting or end-to-end encryption; Declared Age Range; a change to the team's access or the Supabase plan; images in chat; paid features; a serious incident or breach; a change in A14's conclusion.

---

## 10. Sources

Labels follow section 8 of the gap analysis.
- UK GDPR Arts 5, 6, 10, 13, 14, 21, 25, 28, 32, 35, 36, 37 [UKGDPR] (text not re-read; legislation.gov.uk refused automated reads on 17 November 2026).
- DPA 2018 s.11(2) (allegations as criminal offence data) and Schedule 1 (text not re-read).
- ICO, examples of processing likely to result in high risk [ICO-DPIA] (x): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/examples-of-processing-likely-to-result-in-high-risk/
- ICO, sample DPIA template (structure and scales read through search extracts): https://ico.org.uk/media2/migrated/2553993/dpia-template.docx
- ICO, how to do a DPIA (x): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/how-do-we-do-a-dpia
- The Information Commission succeeds the ICO [IC-NAME]: https://www.gov.uk/government/news/information-commission-succeeds-the-ico-as-uks-data-protection-regulator
- Apple, App Review Guidelines 5.1.1(viii) [ARG 5.1.1(viii)]: https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage
- Supabase, access control and roles [SB-ACCESS]: https://supabase.com/docs/guides/platform/access-control
- Supabase DPA [SUPA-DPA]: https://supabase.com/legal/dpa
- Vercel DPA [VERCEL-DPA]: https://vercel.com/legal/dpa
- Expo, sending notifications (US hosting) [EXPO-PUSH]: https://docs.expo.dev/push-notifications/sending-notifications/
- Expo privacy policy [EXPO-PRIV]: https://expo.dev/privacy
- Research reports in `research_notes/App Store readiness/`: `audit-data-inventory.md` (DI), `uk-eu-law.md` (LAW), `apple-requirements.md` (APL), `audit-user-flows.md` (F), `audit-release-ops.md` (RO).
