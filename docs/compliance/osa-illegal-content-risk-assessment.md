# Online Safety Act: illegal content risk assessment

| | |
|---|---|
| **Owner of this record** | The owner, as the individual accountable for the illegal content safety duties and the reporting and complaints duties (ICU A2, section 5.4.1) |
| **Version** | 1.0 — draft for solicitor review (decision D-12). Not signed off. |
| **Date** | 17 November 2026 |
| **Next review** | Three months after the 1.0 release goes live, and no later than 17 May 2027. Then at least every 12 months, and before any significant change (section 7.5). |
| **Purpose** | Resbite Ltd's suitable and sufficient illegal content risk assessment (Online Safety Act 2023 s.9), with the written record s.23 requires, following Ofcom's four-step method. |
| **Provider** | Resbite Ltd, a private limited company registered in England and Wales, company number 12450334. Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom. Contact for this record: support@resbite.com |
| **Gap analysis item** | A13, closing rows DOC-4, UGC-10, UGC-12 and UGC-13 of `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md` |

## Placeholders to fill

1. [[OWNER: the role of the individual accountable under ICU A2 — proposed: the owner, as a director of Resbite Ltd; the name is recorded in the company's own governance records, not in this repo]] (sections 5.1, 5.4.1, 7.1)
2. [[OWNER: the backup moderator's identity — recorded only in the signed team access agreement kept outside the repo; the repo records only that a backup is named, and the date — proposed: one named person at the Supabase Developer role with MFA, named before the 1.0 submission]] (sections 3.6, 5.1, 5.5)
3. [[OWNER: SMS provider — proposed: Twilio]] (sections 3.6, 5.3, 5.4.4)
4. [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]] (sections 3.6, 5.3)
5. [[OWNER: sign-off date by the accountable individual, and the date the board of Resbite Ltd noted it — proposed: after the solicitor's review and once every "To build" item in section 1.7 is live, before the 1.0 submission]] (section 7.1)

## How to read this record

- **Target state.** This record describes Resbite **as it will be at version 1.0**, after workstreams B, C, D and F of the gap analysis are built, using the gap analysis' recommended default for every owner decision D-3 to D-25. Where a statement depends on something not yet built, the item id follows in bold, for example **To build (B7)**. Section 1.7 lists every such item. Until they are live this record overstates the controls, and sign-off waits for them.
- **Evidence.** Each mechanism was checked in the code on 17 November 2026 (branch `app-store-readiness` at `de8ba6a`). Hosted facts come from the repo's records only; nobody touched the hosted project for this record. Where the code and the gap analysis disagree, this record follows the code and says so.
- **Ofcom's documents.** Ofcom's website refused automated reads on 17 November 2026 (HTTP 403). The Codes text in section 5 was read in full from the version laid before Parliament on gov.uk (submitted 16 December 2024, issued 24 February 2025, in force 17 March 2025), plus the later amendments that gov.uk shows. Points taken from Ofcom pages through search-engine extracts are marked **(x)**. Check every measure number against the Codes in force before sign-off.
- **UNVERIFIED** marks a point not confirmed from a primary source.
- **No personal data.** This record names roles ("the owner", "the backup moderator"), never people, and holds no phone numbers, emails of individuals or account ids.

---

## 1. Scope record

### 1.1 The provider

Resbite Ltd provides the service. It decides who may use it and how it works, so it is the "provider" under the Act (s.226, text not re-read). It is a UK company, so it is a **UK provider** for the duty to report child sexual exploitation and abuse content to the National Crime Agency (s.66).

### 1.2 The service assessed

"Resbite" is one service with three parts, all assessed here:

| Part | What it is | Evidence |
|---|---|---|
| The iPhone app | Expo / React Native app, bundle id `com.resbite.app`, iPhone only | `mobile/app.json:11-12` |
| The link web site | `link.resbite.com`, on Vercel. Event pages (`/r/`), personal invitation pages (`/i/`), the legacy `/invite` page, and at 1.0 the legal pages `/privacy`, `/terms`, `/support` and `/delete-account` **To build (D1)** | `links/generate.mjs:76-85` |
| The backend | Supabase project in London (`eu-west-2`): database, Auth, Storage, Realtime and Edge Functions | `docs/implementation-status.md:30` |

**Storefront.** Version 1.0 is offered on the **UK App Store only** (owner, 17 November 2026; decision D-2). The link site is reachable from anywhere, but it serves invitations to plans made in the app.

### 1.3 A regulated user-to-user service

Resbite is a **user-to-user service**: content that one user generates or uploads can be encountered by other users (s.3, text not re-read). That content is:

- chat messages and host announcements;
- display names and profile photos;
- resbite (plan) titles, descriptions, cover photos and their descriptions, places, notes to guests and meeting details;
- connection requests, join requests and invitations.

It has **links with the UK** (s.4(5), text not re-read): the UK is its target market, the App Store storefront is UK only, and the provider is a UK company. So it is a **regulated user-to-user service** under Part 3.

It is not a search service. The only search in the app looks through Resbite's own catalogue of activity ideas (`mobile/app/(tabs)/create.tsx:57-77`), not the web and not user content. There is no provider pornographic content (Part 5).

### 1.4 No exemption applies

Schedule 1 exempts only narrow services (text not re-read; law report LAW-26 (x)):

| Exemption | Does it fit? |
|---|---|
| Email only, SMS or MMS only, or one-to-one live voice only | No. The user content is group chat, photos and plan details |
| Limited functionality: comments and reviews on the provider's own content | No. Users create their own plans, chats and profiles |
| A combination of the above | No |
| Internal business service | No. It is a public consumer service |
| Public bodies; education or childcare providers | No |

### 1.5 Not categorised; other status points

- **Not categorised.** The Category 1 thresholds need a content recommender system and millions of UK users; Category 2B needs more than 3 million UK users with direct messaging (S.I. 2025/226; law report LAW-38 (x)). Resbite has no recommender and 14 confirmed accounts (`docs/implementation-status.md:3`, 16 November 2026). No category duties apply.
- **Not a "large service".** The Codes define a large service as one with more than 7 million monthly active UK users. Resbite is far below that.
- **No fees.** Ofcom's fees apply only to providers with qualifying worldwide revenue of £250 million or more (LAW-38 (x)). Resbite is free and has no revenue.
- **Information notices.** Ofcom can require information (s.100). The law-enforcement and regulator procedure (A22, `docs/compliance/law-enforcement-requests.md`) sets how Resbite Ltd answers on time **To build (A22)**.

### 1.6 When this assessment was needed

- A new service must have its assessment within three months of starting, and a **significant change** needs a fresh assessment **before** it is made (s.9(4); Ofcom risk assessment guidance (x); LAW-27).
- Chat, groups and safety went live to UK and European testers on 12–13 November 2026 (`qa/chat-release/README.md:860-869`), and the open beta let any confirmed account in on 16 November 2026 (`docs/implementation-status.md:3`). The law report takes the cautious view that these, and the public App Store listing, are significant changes (LAW-27; gap analysis open question 19).
- So this record is completed **before the public release**, and it covers the service as it will be at 1.0.

### 1.7 What must be built before this record is true

The ratings in section 4 lean on these controls. Sign-off waits until each is live.

| Id | What it adds | Used in |
|---|---|---|
| C1, B12, D6 | Real SMS codes: every account has a really verified phone; the `000000` test swap gone [[OWNER: SMS provider — proposed: Twilio]] | 3.6, 5.3, 5.4.4 |
| B2, C8, D3, D4 | 18+ and Terms acceptance, by version, on every account and on the web route | 3.1, 5.4.6 |
| B7, C7 | New report reasons: "Illegal or dangerous", "Child safety", "Intimate image shared without consent" | 4.2, 5.1, 5.4 |
| C7 | The blocked-terms check extended to titles, descriptions, notes to guests, meeting details and display names | 4.2, 5.3 |
| C6 | Team scripts: suspend by account id; remove a profile photo; remove a resbite's title, description, notes or cover; set and lift a legal hold | 5.1 (C2), 5.4 |
| C5, F2, A24, F16 | A named backup moderator with written instructions and MFA; a moderation rota (placeholder 2) | 5.1, 5.5, 6 |
| A15 | The moderation and takedown standard (`docs/compliance/moderation-standard.md`) | 5.1, 5.4 |
| A3 | Terms of Use with the community rules, published at `https://link.resbite.com/terms` | 5.1 (G1, G3) |
| A4, A5, D1, F1, F4 | `/support` with the support and privacy inboxes, a web report and complaint route for people who are not users, a contact form, and the complaints and appeals procedure | 5.1 (D measures), 5.4.7 |
| B1, B6 | Always-on legal links in the app; the support address on the suspended and taken-number screens | 5.1 (D2, G3) |
| B6, C2 | Suspended accounts see Delete account and the support address; deletion works for every account type and respects a legal hold (D-19) | 5.4.6, 6 |
| A22, C2, C3, C6 | Legal hold and the law-enforcement and regulator procedure | 5.4.8 |
| B8 | The unused `expo-location` package removed, so the app holds no device-location code | 3.3 |
| B4 | The Wellness tab hidden (D-7) | 3.3 |
| B11, C9 | The optional date of birth, second phone, city and interests removed (D-9) | 3.1 |
| B16, D10, C11 | CAPTCHA on code requests, switched on after the build that sends its token [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]] | 5.3 |
| E4 | App Store age rating overridden to 18+ | 3.1 |

---

## 2. How this assessment was done

We followed Ofcom's four steps for a user-to-user service (risk assessment guidance, v2.0, 25 June 2026 (x)):

1. **Understand the kinds of illegal content to assess** (sections 1 and 4).
2. **Assess the risk of harm**: use Ofcom's Risk Profiles to find the risk factors that apply, then give each kind a risk level with reasons (sections 3 and 4).
3. **Decide measures, put them in place and record them** (section 5).
4. **Report, review and update** (section 7).

**Kinds of content.** Ofcom's guidance now counts **18 kinds** of priority illegal content (x). These are the 17 kinds in Table C of the Codes, with "encouraging or assisting suicide" widened to **suicide and self-harm** (the serious self-harm offence), plus **cyberflashing** as a new separate kind. Cyberflashing became a priority offence on 8 January 2026 (gov.uk press release, read directly). Ofcom's statement of 25 June 2026 asked providers to update their assessments (x). Child sexual exploitation and abuse (CSEA) is assessed in its three parts from Table C: image-based child sexual abuse material (CSAM), CSAM URLs and grooming. **Other (non-priority) illegal content** is assessed too (section 4.3).

**Inputs used.** Ofcom's "core inputs" (x):

- Ofcom's Risk Profiles for user-to-user services (x), matched against the functionality list in section 3.3;
- the service's own data: on 16 November 2026 the hosted counts were 14 confirmed accounts, 9 profiles, 43 plans, 7 chat messages, **0 reports, 0 blocks and 0 suspensions** (`qa/open-beta-2026-11-16/hosted-counts-after.json`; `docs/implementation-status.md:3`);
- complaints and incidents: none recorded;
- the existing controls, checked in the code (section 3.6);
- Ofcom's Register of Risks (x) and the gap analysis and its five source reports.

**Inputs not used.** Ofcom's "enhanced inputs" (commissioned research, user surveys, external audits, product testing data) were not used. The service is small and new, and has too little use for them to tell us much. They will be considered at the first review after launch, once real use builds up.

**What the evidence can and cannot show.** Zero reports from 14 accounts and 7 messages is far too little use to show low risk on its own. So the ratings rest mainly on the **design**: who can reach whom, what can be posted, and how far it can spread. The first review, three months after launch, re-tests them against real reports.

**Risk levels.** For each kind we judged:

- **likelihood**: how likely the content is to appear on Resbite, or the service to be used to commit or facilitate the offence, given its functionalities, users and evidence;
- **impact**: how severe the harm is to the people affected, and how many could encounter it.

We then gave one of Ofcom's four levels: **negligible**, **low**, **medium** or **high**. The level reflects the service as designed at 1.0, and we record the existing controls that bear on it, as Ofcom's record-keeping guidance asks (x). Ofcom's own risk-level tables could not be read directly (x); the levels below should be checked against them at sign-off.

---

## 3. Step 1: the service and its risk factors

### 3.1 Users

- **Adults only.** Resbite is for people aged 18 and over (owner, 17 November 2026). Every account confirms "I'm 18 or over" and accepts the current Terms version **To build (B2, C8, D3, D4)**; today the tick appears only on phone sign-up, the app invitation flow and the web route (`mobile/app/auth/phone.tsx:101-109`; `mobile/app/invite.tsx:242-254`; `links/assets/personal-flow.mjs:24-25`). The App Store age rating is overridden to 18+ **To build (E4)**. Whether children can still get in is assessed in A14 (`docs/compliance/childrens-access-assessment.md`).
- **Every account has a verified phone number** (`mobile/src/domain/accountRoute.ts:11`), checked by a real SMS code at 1.0 **To build (C1)**. Sign in with Apple, Google and email and password also exist, but each still needs a verified phone before the app can be used.
- **Size.** 14 confirmed accounts on 16 November 2026, testers in the UK and Europe (`docs/implementation-status.md:3`). Growth after launch is unknown. There is no marketing plan on record.
- **Where.** The UK App Store only for 1.0. Web-only accounts can be made on the link site when someone answers an invitation by phone.
- **Language.** The app is in English. The blocked-terms list holds English and Spanish terms (`qa/chat-release/README.md:869`).
- **No optional personal details.** The optional date of birth, second phone, city and interests are removed **To build (B11, C9)**.

### 3.2 Type of service

Resbite helps adults plan small get-togethers with people they know: a host makes a "resbite" (a plan, one-off or weekly), invites people, and everyone going chats about it. Among Ofcom's service types it is closest to a **private messaging service** with some **social media** features (profiles and connections). It is not a dating, marketplace, gaming, discussion forum, file-sharing, video-sharing or adult service.

### 3.3 Functionalities

| Functionality (Ofcom risk factor) | On Resbite at 1.0? | How it works | Evidence |
|---|---|---|---|
| User profiles | Yes, minimal | A display name (1–80 characters) and an optional profile photo. No bio, no age, no location, no public profile page. Seen only by people who share a resbite with the person | `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:12-18`; DI §3 |
| Anonymous or pseudonymous profiles | Partly | The display name is free text, so it may not be a real name. But every account is tied to a verified phone | `mobile/src/domain/accountRoute.ts:11` |
| User connections | Yes | Two people who **shared a resbite** can connect: one asks, the other accepts. A "Not now" is never shown to the person asking | `supabase/migrations/20261110120000_connections.sql:6-42` |
| Group messaging | Yes | **One chat per resbite.** On a one-off, the hosts and the people going or maybe going read and write it; it goes read-only 48 hours after the end. On a weekly group, everyone invited to the current week reads and writes it while the series runs. Text only, up to 1,000 characters, at most 30 messages a minute per person | `supabase/migrations/20261111140000_chat_core.sql:31-45,131-160,455,480`; `docs/implementation-status.md` (chat groups entry) |
| Direct messaging | In effect only | There is no separate direct message. A resbite with one host and one guest gives a two-person chat, but only after the host invites and the guest says yes | as above |
| Encrypted messaging | No | Chat is stored on the server, readable by later joiners, not end-to-end encrypted | DI §6 |
| Posting images | Limited | **No images in chat.** The only images are one profile photo per person and one cover photo per resbite, picked from the photo library, re-encoded as JPEG, metadata stripped, 2 MB at most. Covers can be seen by anyone with the event link (the web image route) | `mobile/src/services/photo.ts:51-90`; `supabase/migrations/20261007200000_plan_covers.sql:41-70`; `links/server/api/image.mjs:55-68` |
| Video, livestreaming, voice | No | — | `mobile/package.json` (no such packages) |
| Hyperlinks | Yes, in chat | Only `http` and `https` links to a domain name are tappable. No IP addresses, no punycode, no `localhost`. Tapping asks "Open example.com?" (the link's own domain) first | `mobile/src/domain/chatRules.ts:520-578`; `mobile/app/chat.tsx:1100-1117` |
| Posting location | Typed only | A host types the meeting place, which may be a home address. Everyone invited sees it. The "area" (up to 80 characters) is public on the event link page. Private meeting details (door codes) are shown only to people going or maybe going. **No device location** | DI §4; `expo-location` removed **To build (B8)** |
| Commenting on content; reposting or forwarding | No | — | — |
| Searching for user content or people | No | Search covers only the activity ideas catalogue. Someone who has a person's phone number can learn that they are "On Resbite" (the contact lookup, 500 numbers a day) | `mobile/app/(tabs)/create.tsx:57-77`; `supabase/migrations/20261028120000_contact_invitations.sql:49-81` |
| Recommender systems; public feed | No | Nothing suggests people or content. There is no public feed | searched `mobile/app`, `mobile/src` |
| Goods or services for sale; payments | No | Free, no purchases, no ads | `mobile/package.json:14-54` |
| Open event links | Yes | A host can share an event link (`/r/`). Anyone with it sees the title, host's name, time, area and cover, and can **ask to join; the host approves or declines** | `supabase/migrations/20261029120000_open_link_approval.sql:1-26`; `supabase/migrations/20261031120000_creating_a_resbite.sql:247-264` |
| Guests bringing people ("circles of trust") | Yes, host's choice | The host sets how many people each guest may bring (default **0, "Nobody"**, up to 3) and how many levels (1 to 3). Brought people join without approval. Someone the host removed cannot be brought straight back | `supabase/migrations/20261111130000_circles_of_trust.sql:1-22,38-51` |
| Host tools | Yes | Hosts send announcements, remove messages and remove people from their resbite | `supabase/migrations/20261111140000_chat_core.sql:573-607` |
| Wellness tab | No | Hidden for 1.0 **To build (B4)** | — |

### 3.4 How people reach each other

There is **no way to find strangers** inside Resbite. A person can only reach someone else by:

1. being invited by a host who has their phone number or is connected to them;
2. holding an event link and being approved by the host;
3. being brought by a guest, within the host's limits;
4. having shared a resbite, and then asking to connect.

Invitations by phone are sent from the host's own Messages or WhatsApp with neutral text (`mobile/src/services/inviteSend.ts:26-49`). Resbite does not send them. Phone numbers are never shown to other users (DI §2).

The widest reach any user content has is an **open event link** posted somewhere public: its title, host name, area and cover can then be seen by anyone, and anyone can ask to join.

### 3.5 Business model and growth

Free, with no ads, no tracking and no in-app purchases (owner, 17 November 2026). Paid features may come later; adding them is a trigger for review (section 7.5). There is no revenue from engagement, so nothing pushes for virality or time spent.

### 3.6 Controls in place at 1.0

| Control | Status on 17 Nov 2026 |
|---|---|
| Chat rules accepted before a first message: "Be kind. No harassment, hate, threats or spam. Messages that break these rules are removed, and people who break them can lose their account." | Live (`mobile/src/domain/safetyCopy.ts:52-54`; `supabase/migrations/20261111160000_chat_safety.sql:811-857`) |
| Blocked-terms filter: 37 terms (clear slurs, explicit threats, sexual harassment and scam spam, in English and Spanish), whole words, any case; a message with one is refused and not stored | Live for chat messages and announcements (`supabase/migrations/20261111160000_chat_safety.sql:822-832,999,1057`; `qa/chat-release/README.md:869`) |
| The same check on titles, descriptions, notes to guests, meeting details and display names | **To build (C7)** |
| Report a message or a person from five places (chat, people list, resbite page, invitation card, Connections), with a VoiceOver action | Live (`mobile/app/chat.tsx:881,1013-1019`; `mobile/app/guests.tsx:385`; `mobile/app/event.tsx:549`; `mobile/app/(tabs)/plans.tsx:576`; `mobile/app/connections.tsx:254`) |
| Report reasons Harassment, Spam, Not appropriate, Something else | Live (`mobile/src/domain/safetyCopy.ts:14`) |
| New reasons "Illegal or dangerous", "Child safety", "Intimate image shared without consent", triaged first | **To build (B7, C7)** |
| Block: hides the person's messages and pushes from the blocker, ends any connection; the blocked person is never told | Live (`supabase/migrations/20261111160000_chat_safety.sql:22-35,82-128`) |
| Rate limits: 30 messages a minute, 20 reports a day, 500 phone lookups a day | Live (`supabase/migrations/20261111140000_chat_core.sql:455,480`; `supabase/migrations/20261111160000_chat_safety.sql:1133,1209`; `supabase/migrations/20261028120000_contact_invitations.sql:57`) |
| Moderator push "A new report is waiting." (no names or words) and a daily read of the queue | Live (`supabase/functions/_shared/notification-copy.ts:167-171`; `qa/chat-release/README.md:827-858`) |
| Remove a reported message; suspend the account (plus an Auth ban by hand); undo a suspension | Live (`supabase/ops/remove-reported-message.sql`; `supabase/ops/suspend-account.sql`) |
| Suspend by account id; remove a photo, title, description, notes or cover; legal hold | **To build (C6)** |
| A backup moderator and a rota | **To build (C5, F2, A24)** (placeholder 2) |
| Host approval for open-link joiners; host removal of people and messages; circle limits defaulting to "Nobody" | Live |
| Links open only after a check that names the link's domain, for example "Open example.com?" | Live (`mobile/app/chat.tsx:1100-1117`) |
| Real SMS codes on every account | **To build (C1, B12, D6)** [[OWNER: SMS provider — proposed: Twilio]] |
| CAPTCHA on code requests | **To build (B16, D10, C11)** [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]] |
| Support and privacy inboxes; web report and complaint route; contact form | **To build (F1, A4, D1)** |
| Photo metadata stripped; phone numbers never shown to others | Live (`mobile/src/services/photo.ts:51-90`; DI §2) |

---

## 4. Step 2: risk of each kind of illegal content

### 4.1 Summary

| # | Kind of illegal content | Risk level |
|---|---|---|
| 1 | Terrorism | Low |
| 2A | CSEA: image-based CSAM | Low |
| 2B | CSEA: CSAM URLs | Low |
| 2C | CSEA: grooming | Low |
| 3 | Suicide and self-harm | Low |
| 4 | Hate | Low |
| 5 | Harassment, stalking, threats and abuse | **Medium** |
| 6 | Controlling or coercive behaviour | Low |
| 7 | Drugs and psychoactive substances | Low |
| 8 | Firearms, knives and other weapons | Low |
| 9 | Unlawful immigration | Negligible |
| 10 | Human trafficking | Low |
| 11 | Sexual exploitation of adults | Low |
| 12 | Extreme pornography | Low |
| 13 | Intimate image abuse | Low |
| 14 | Proceeds of crime | Low |
| 15 | Fraud and financial services | Low |
| 16 | Foreign interference | Negligible |
| 17 | Animal cruelty | Low |
| 18 | Cyberflashing | Low |
| — | Other (non-priority) illegal content | Low |

**What this means for the Codes.** Resbite is at medium risk of **one** kind of illegal harm. A service is "multi-risk" only at medium or high risk of two or more kinds (Codes para 5.6), so Resbite is **neither large nor multi-risk**. The measures for "all services" apply, plus ICU D4 and D6, which apply to services at medium or high risk of any kind (section 5.1).

**Evidence that applies to every kind.** On 16 November 2026 there were no reports, blocks or suspensions on record, from 14 accounts and 7 chat messages (section 2). That is too little use to prove anything, so each rating below rests on the design in section 3.

### 4.2 Each kind

**1. Terrorism — Low**
- *Risk factors present:* text in group chats; links in chat; display names and profile photos; resbite titles and covers, which anyone with an event link can see.
- *Against:* no public feed, search, recommender, resharing, video or livestream. A chat holds only the people on one resbite. Nothing spreads beyond them.
- *Likelihood:* low. *Impact:* severe, but reach is very small.
- *Measures:* ICU H1 (section 5.4.2); the "Illegal or dangerous" reason **To build (B7, C7)**; removal and suspension (C6); referral to the police under A22.

**2A. CSEA: image-based CSAM — Low**
- *Risk factors present:* profile photos (seen by people on a shared resbite) and cover photos (seen by anyone with the event link, the widest-reach image on the service).
- *Against:* no images in chat, no galleries, no file sharing, no video. One profile photo per person, one cover per resbite.
- *Likelihood:* low. *Impact:* very severe.
- *Measures:* the "Child safety" reason **To build (B7, C7)**; photo and cover removal **To build (C6)**; the CSEA path: preserve, report to the NCA, suspend and ban, never forward (section 5.4.5). Hash matching (ICU C9) does not apply (section 5.2).

**2B. CSEA: CSAM URLs — Low**
- *Risk factors present:* `http` and `https` links in chat.
- *Against:* chats are small and closed; links open only after a check; no public posting of links.
- *Likelihood:* low. *Impact:* very severe.
- *Measures:* as 2A. URL-list matching (ICU C10) does not apply (section 5.2). Moderators never open a reported link that may lead to CSAM (A15).

**2C. CSEA: grooming — Low**
- *Risk factors present:* user profiles, user connections, group chats, two-person chats, open event links and guests bringing people, which can put strangers in one chat; the meeting place, which leads to meeting in person.
- *Against:* the service is for adults only, with the 18+ tick on every account **To build (B2, C8)** and an 18+ App Store rating **To build (E4)**. There is no way to search for or browse people. Profiles show no age. Connections need a shared resbite. Open-link joiners need the host's approval. Children are not expected users (A14).
- *Likelihood:* low, because children are not expected to use the service. *Impact:* very severe, made worse by in-person meetings.
- *Condition:* this rating holds only while A14 concludes that children are not likely to access the service. If A14 changes, grooming moves to at least medium, and ICU F1 and F2 are reconsidered.
- *Measures:* the "Child safety" reason **To build (B7, C7)**; the under-18 rule (section 5.4.6); the CSEA path (section 5.4.5).

**3. Suicide and self-harm — Low**
- *Risk factors present:* text chat.
- *Against:* no forums, no topic communities, no content discovery, no recommender. Chats are about a shared plan among invited people.
- *Likelihood:* low. *Impact:* severe for the person.
- *Measures:* report and review; A15 sets how the team responds to a risk to life (999 first, A22).

**4. Hate — Low**
- *Risk factors present:* chat; display names; resbite titles and descriptions, where the title is public on an event link page.
- *Against:* the filter refuses clear slurs in chat **(Live)** and, at 1.0, in titles, descriptions, notes, meeting details and display names **To build (C7)**. Chats are closed and small; no amplification.
- *Likelihood:* low. *Impact:* moderate; small reach.
- *Measures:* filter; report; removal; suspension.

**5. Harassment, stalking, threats and abuse — Medium**
- *Risk factors present:*
  - group chats where not everyone knows each other, because open links and guests bringing people (up to three levels) mix circles;
  - weekly groups whose chat runs for as long as the series repeats;
  - connection requests between people who met once;
  - the meeting place and time, which may be a home address, shown to everyone invited: useful to a stalker;
  - the "On Resbite" lookup, which tells anyone holding your number that you use Resbite;
  - a suspended person can come back with another number (section 5.4.4).
- *Against:* phone numbers are never shown to other users. Private meeting details go only to people going or maybe going. Block hides a person at once and ends any connection. Hosts can remove people and messages. A "Not now" to a connection is never shown. The filter refuses explicit threats and sexual harassment terms. Messages are rate-limited.
- *Likelihood:* medium. Any chat among adults who fall out can carry abuse, and Resbite's purpose is meeting in person. *Impact:* moderate to severe for the person targeted; reach is small.
- *Measures:* report from every surface; block; host tools; filter; action within 24 hours of a report (A15) **To build (C5, F2)**; suspension by account id **To build (C6)**; D4 and D6 complaint handling (section 5.1).
- *Residual:* low to medium. We accept it for 1.0 and re-test it at the first review.

**6. Controlling or coercive behaviour — Low**
- *Risk factors present:* an abusive partner or family member could use shared resbites and guest lists to see who someone meets, or apply pressure in chat.
- *Against:* no live location, no activity status, no "last seen", no read receipts shown to others. Block and leaving a group are available.
- *Likelihood:* low. *Impact:* severe for the person.
- *Measures:* block; report; A15.

**7. Drugs and psychoactive substances — Low**
- *Risk factors present:* plans and chat could arrange supply at a gathering; an open link could advertise an event.
- *Against:* no marketplace, no payments, no public listing of events, no search.
- *Likelihood:* low. *Impact:* moderate.
- *Measures:* the "Illegal or dangerous" reason **To build (B7, C7)**; removal; suspension.

**8. Firearms, knives and other weapons — Low**
- *Risk factors present:* chat text could offer weapons.
- *Against:* no marketplace, listings or payments; the sales offences in this kind mostly need selling features Resbite does not have.
- *Likelihood:* low, close to negligible. *Impact:* severe.
- *Measures:* as 7.

**9. Unlawful immigration — Negligible**
- *Risk factors present:* none of note. The offences are about illegal entry and assisting it; online, the risk lies in advertising crossings or documents to wide audiences.
- *Against:* no wide audience, no search, no public feed, phone-verified accounts, UK storefront.
- *Likelihood:* negligible. *Impact:* severe.
- *Measures:* general reporting and removal.

**10. Human trafficking — Low**
- *Risk factors present:* an open link could advertise a fake job or event to recruit people; chat could coordinate.
- *Against:* no public listings; host approval; small groups; phone-verified accounts.
- *Likelihood:* low. *Impact:* very severe.
- *Measures:* "Illegal or dangerous" reason **To build (B7, C7)**; police referral (A22).

**11. Sexual exploitation of adults — Low**
- *Risk factors present:* an event and its open link could advertise sexual services; chat could coordinate.
- *Against:* no listings, payments or discovery; images limited to two slots.
- *Likelihood:* low. *Impact:* severe.
- *Measures:* as 10.

**12. Extreme pornography — Low**
- *Risk factors present:* profile and cover photos.
- *Against:* no images in chat; one image slot each; covers are seen by the resbite's guests and link holders only.
- *Likelihood:* low. *Impact:* moderate to severe.
- *Measures:* report; photo and cover removal **To build (C6)**; suspension.

**13. Intimate image abuse — Low**
- *Risk factors present:* an intimate image of someone else could be uploaded as a profile photo or cover (a cover reaches everyone with the link); threats to share an intimate image can be made in chat text.
- *Against:* no images in chat or direct messages; two image slots in all; small closed groups.
- *Likelihood:* low. *Impact:* very severe for the person shown.
- *Measures:* the 48-hour takedown from launch, a dedicated report reason and a web route for people who are not users (section 5.4.3).

**14. Proceeds of crime — Low**
- *Risk factors present:* chat could be used to recruit money mules among acquaintances.
- *Against:* no payments, no marketplace, no stranger discovery.
- *Likelihood:* low. *Impact:* moderate.
- *Measures:* general reporting and removal.

**15. Fraud and financial services — Low**
- *Risk factors present:* a fake event shared by open link could collect "deposits" outside the app; phishing links in chat; impersonation through a free-text name and a photo.
- *Against:* events are not listed or searchable; joiners need the host's approval; every account has a verified phone **To build (C1)**; CAPTCHA slows fake sign-ups **To build (B16, D10, C11)**; the filter covers known scam spam; Resbite takes no payments.
- *Likelihood:* low. This is the kind nearest to medium: a first confirmed fraud report triggers a review (section 7.5). *Impact:* moderate (money lost).
- *Measures:* "Illegal or dangerous" reason **To build (B7, C7)**; removal; suspension.

**16. Foreign interference — Negligible**
- *Risk factors present:* none of note. The offence (National Security Act 2023 s.13) is about conduct for a foreign power; online, the risk lies in coordinated campaigns that reach large audiences.
- *Against:* no public reach, no feed, no resharing.
- *Likelihood:* negligible. *Impact:* severe in principle.
- *Measures:* general reporting and removal.

**17. Animal cruelty — Low**
- *Risk factors present:* a cover or profile photo could show cruelty; chat could arrange it.
- *Against:* no video; two image slots; small groups.
- *Likelihood:* low. *Impact:* moderate.
- *Measures:* report; removal **To build (C6)**.

**18. Cyberflashing — Low**
- *Risk factors present:* the only images are profile and cover photos. A cover showing genitals would be seen by every guest and by anyone with the link.
- *Against:* no images in chat, so no one can send a picture to one person.
- *Likelihood:* low. *Impact:* moderate to severe.
- *Measures:* report ("Not appropriate" now; "Illegal or dangerous" at 1.0 **To build (B7, C7)**); photo and cover removal **To build (C6)**; suspension.

### 4.3 Other illegal content

Non-priority offences that could happen on a chat service: false communications and threatening communications (Online Safety Act ss.179 and 181), sending flashing images to people with epilepsy (s.183), and offences under other laws, such as sharing someone's address to harass them. Text not re-read.

- *Likelihood:* low. *Impact:* moderate.
- *Measures:* the same reporting, review, removal and suspension. Moderators judge content against the Terms (ICU C1.3(b)) or make an illegal content judgement using Ofcom's Illegal Content Judgements Guidance (A15).

### 4.4 Harms outside the list that we still watch

- **Meeting in person.** Resbite leads to real meetings, sometimes with people who joined through a link. Offline harm is outside the priority list (except stalking and CSEA), but it shapes the design: the area alone is public, the place goes only to invitees, door codes only to people going, and hosts approve link joiners.
- **Reused phone numbers.** A carrier may give a dormant number to someone new, who could then sign in to the old account (gap analysis SI-11). This is weighed in the DPIA (A9, `docs/compliance/dpia.md`).

---

## 5. Step 3: measures

### 5.1 Codes measures Resbite follows

Following the Codes is a safe harbour: a provider that takes the relevant recommended measures is treated as complying with the duty they cover (ss.49–50; the gov.uk explanatory memoranda, read directly).

| Measure | What it asks | How Resbite meets it at 1.0 | Status |
|---|---|---|---|
| **ICU A2** Accountable individual | Name an individual accountable to the most senior governance body for the illegal content safety duties and the reporting and complaints duties | The individual in section 5.4.1, accountable to the board of directors of Resbite Ltd (placeholder 1) | To confirm |
| **ICU C1** Moderation function to review and assess | Review content the provider has reason to suspect is illegal; make an illegal content judgement, or decide whether it breaks Terms that prohibit that kind of content | A15 sets the review. Every report pushes the moderators and the queue is read daily (`supabase/ops/open-reports.sql`). The Terms prohibit every kind of priority illegal content, so moderators can act on a Terms breach (A3) | Live in part; **To build (A15, A3)** |
| **ICU C2** Swift takedown | Systems to take illegal content down swiftly once aware | Action within 24 hours of a report; intimate images within 48 hours at most. Messages: `remove-reported-message.sql` (Live). Photos, titles, descriptions, notes and covers: **To build (C6)**. Cover by the owner plus the backup moderator **To build (C5, F2)** (placeholder 2) | Partly live |
| **ICU D1** Enabling complaints | Let every type of relevant complaint be made, by users and affected persons | In the app: report from five surfaces (Live). On the web: `/support` with the support inbox, a contact form and a route for people who are not users **To build (A4, D1, F1)** | Partly live |
| **ICU D2** Easy to find, access and use | A reporting tool beside each piece of content; other complaints easy to find; only necessary steps; room for supporting detail; accessible, including screen readers | Report sits beside each message and person, with a VoiceOver action and an optional details field (500 characters). A resbite's title and cover are reported by reporting the host from the resbite page; a separate "Report this resbite" is deferred (D-17, section 5.5). `/support` linked from the app's "About and legal" **To build (B1, D1)** | Partly live |
| **ICU D4** Indicative timeframes | Acknowledge each complaint and give an indicative time for deciding it | The in-app report thanks states the review time, and the support inbox's first reply does the same **To build (B7 copy, F1, A5)** — see section 8, point 4 | To build |
| **ICU D6** Opt-out from communications | Let the complainant opt out of further non-ephemeral messages about their complaint | A5 lets a complainant ask for no updates; the team honours it **To build (A5, F4)** | To build |
| **ICU D7** Complaints about suspected illegal content | Treat the complaint as reason to suspect, review it under C1, and consider it promptly | Every report and every web complaint is reviewed under A15 within the same 24-hour target | Live in part; **To build (A15)** |
| **ICU D9** Appeals, decided promptly | Decide appeals promptly (services neither large nor multi-risk) | Appeals against removal or suspension go to the support inbox and are decided promptly, with the indicative time stated in A5 and on `/support` **To build (A5, F4)** | To build |
| **ICU D10** Action after an appeal | If an appeal succeeds, restore the user or content as far as possible, and fix guidance if errors repeat | A suspension is undone exactly by the undo statement in `supabase/ops/suspend-account.sql` (Live). A removed message cannot be restored to the chat (its text is blanked); the team tells the person and corrects its guidance (A15) | Live in part |
| **ICU D11** Complaints about proactive technology | Tell the complainant what action may follow and of their right to bring proceedings for breach of contract | Covers the blocked-terms filter. A5 holds the reply **To build (A5)** | To build |
| **ICU D12** Other complaints about compliance | A named person or team; handled within set timeframes | The accountable individual (section 5.4.1) handles complaints about these duties, including freedom of expression and privacy, within A5's times | To build (A5) |
| **ICU D13** Manifestly unfounded complaints | An exception, usable only with a written policy | **Not used at 1.0.** Every complaint is handled. If volume grows, a D13 policy may be written and recorded here | — |
| **ICU G1** Terms: substance | Terms say how people are protected from illegal content, separately for terrorism, CSEA and other priority illegal content; how content is taken down swiftly; what proactive technology is used (kind, when, how); how complaints are handled | A3 must carry each item, including the blocked-terms filter as proactive technology **To build (A3)** — see section 8, point 3 | To build |
| **ICU G3** Terms: clarity and accessibility | Easy to find, also for people not signed in; well laid out; readable for the youngest permitted user (18); usable with screen readers | `https://link.resbite.com/terms`, linked from the welcome and sign-in screens and every site page; plain English **To build (A3, B1, D1, D2)** | To build |
| **ICU H1** Proscribed organisations | Remove accounts where there are reasonable grounds to infer they are run by or for a proscribed organisation | Section 5.4.2; A15 **To build (A15, C6)** | To build |

### 5.2 Codes measures that do not apply

| Measure | Why it does not apply |
|---|---|
| ICU A1 (annual review by the senior body) | Large services only. We still review yearly (section 7.4) |
| ICU A3, A5, A6, A7; C3–C8; D8 | Large or multi-risk services only |
| ICU A4 | Large services that are multi-risk |
| ICU C9 (hash matching for CSAM) | Large services at medium or high risk of image-based CSAM, or services at high risk with more than 700,000 monthly UK users or that are file-storage and file-sharing services. Resbite is none of these |
| ICU C10 (CSAM URL lists) | Large services at medium or high risk of CSAM URLs, or services at high risk with more than 700,000 monthly UK users |
| ICU C14 (hash matching for intimate image abuse; in force 30 September 2026 (x)) | Services that let users share images and are either at **high** risk of intimate image abuse and mainly host pornography, have more than 700,000 monthly UK users, or are file-storage and file-sharing services; or large services at medium or high risk (gov.uk draft amendments, read directly). Resbite is at low risk and small |
| ICU C15 (crisis response protocol; in force 2 November 2026) | Large services at medium risk of terrorism, hate, harassment or foreign interference, and services of any size at **high** risk of them (gov.uk explanatory memorandum, read directly; the measure number is from search extracts (x)). Resbite is at medium risk of harassment but is not large, and is not at high risk of any of them |
| ICU D3, D5 | Services likely to be accessed by children that are large or at medium or high risk. A14 concludes Resbite is not likely to be accessed by children |
| ICU D14 | Large services at medium or high risk of fraud |
| ICU E1 | Services that test content recommender systems. Resbite has none |
| ICU F1, F2 (safety defaults and support for child users) | Services with an existing means of determining a user's age, specified functionalities, and a high risk of grooming (or large with medium risk). Resbite is at low risk of grooming |
| ICU G2 | Category 1 services only |
| ICU J1–J3 | Large services only. Resbite has blocking anyway |

**Not yet in force, or not confirmed.** Ofcom's Code changes for the new self-harm and cyberflashing offences needed Parliament's approval after the 25 June 2026 statement; whether they are in force is UNVERIFIED. Ofcom said it would decide its remaining "additional safety measures" (proposed June 2025) in autumn 2026 (x); no statement was found by 17 November 2026. A measure for all services in either would trigger a review (section 7.5).

### 5.3 Measures beyond the Codes

- **Design that keeps strangers apart:** no search for people, no public profiles, no feed; connections only after a shared resbite; host approval for link joiners; guest bringing off by default.
- **Images kept narrow:** no images in chat; one profile photo and one cover each; metadata stripped.
- **Blocked-terms filter** on chat (Live) and other text **To build (C7)**.
- **Chat rules** accepted before the first message (Live).
- **Rate limits** on messages, reports and lookups (Live).
- **Verified phone on every account** **To build (C1)** [[OWNER: SMS provider — proposed: Twilio]], and **CAPTCHA** on code requests after the build that sends its token **To build (B16, D10, C11)** [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]]. Both raise the cost of fake and repeat accounts.
- **Links checked before opening** (Live).
- **Block** for every user (Live).
- **18+ on every account** and an 18+ App Store rating **To build (B2, C8, E4)**.

### 5.4 Decisions recorded here

#### 5.4.1 The accountable individual (ICU A2)

- **Who:** [[OWNER: the role of the individual accountable under ICU A2 — proposed: the owner, as a director of Resbite Ltd; the name is recorded in the company's own governance records, not in this repo]] (decision D-6).
- **Accountable to:** the board of directors of Resbite Ltd, the most senior governance body.
- **Accountable for:** managing the risks in this record, including the residual risks in section 5.5; compliance with the illegal content safety duties (s.10) and the reporting and complaints duties (ss.20–21); and handling complaints under ICU D12.
- **How:** signs off this record and each review, and reports the review to the board (section 7.1).

#### 5.4.2 Proscribed organisations (ICU H1)

A15 holds the steps **To build (A15)**. In short:

- **When we check:** when content made with an account is judged to be proscribed organisation content, or a report or complaint says an account may be run by or for a proscribed organisation.
- **Indicators**, adapted to Resbite's profile (ICU H1.6): (a) the display name is the name of a proscribed organisation, or an alias named in a Terrorism Act 2000 s.3(6) order; (b) the profile photo, or a cover photo the account set, is proscribed organisation content. Resbite has no bio. Two indicators give reasonable grounds; so may a significant share of the account's recent content we are allowed to see (ICU H1.7).
- **Private chats:** we do not sample private chats for H1.7 unless we have explicit consent to view the content (ICU H1.8). We look only at content reported to us and at what the account shows on shared or public surfaces: its name, photo, and resbite titles and covers. Our view that Resbite's resbite chats are "communicated privately" under Ofcom's guidance is a judgement for the solicitor.
- **The list:** the moderator checks the Home Office's current list of proscribed groups on gov.uk at the time.
- **Action:** remove the account (suspend, then delete it) **To build (C6, C2)**; preserve evidence under a legal hold and refer to the police under A22 **To build (C6, A22)**; the person may appeal (ICU D9, D10).

#### 5.4.3 Intimate image abuse: the 48-hour takedown, and why no hash matching

- **From launch** we apply the duty in the Crime and Policing Act 2026 (inserting OSA s.20A), whatever its commencement date (decision D-21). The gov.uk factsheet gives no commencement date; it is UNVERIFIED.
- **Reporting:** a reason "Intimate image shared without consent" in the app **To build (B7, C7)**, and a web route on `/support` for people who are not users, including the person shown or someone acting for them **To build (D1, A4)**.
- **Takedown:** as soon as reasonably practicable and within **48 hours** of a valid report (made by or for the person shown), the team removes the image, title or text with the C6 scripts and suspends the uploader **To build (C6, A15)**.
- **Stopping it coming back:** the uploader is suspended, so cannot upload again. The team checks the uploader's other image slot and the resbites they host, and keeps a short description of the image (never the image) in the case record outside the repo, so a re-upload reported later is recognised.
- **Why no hash matching for 1.0:** ICU C14 does not apply (section 5.2). Images are limited to one profile photo per person and one cover per resbite, seen by small invited groups or by link holders. There are no images in chat. A hash service (such as StopNCII.org) would add a vendor and image processing out of proportion to this risk. Reviewed yearly, and at once if images are added to chat or the service grows.
- **Apple:** this also meets Apple's ask that apps "proactively prevent and remove" nonconsensual intimate imagery as far as it applies to a service this narrow (gap analysis UGC-10). Whether App Review accepts this without hash matching is UNVERIFIED.

#### 5.4.4 Ban evasion (decision D-25)

- **The risk:** a suspended person can sign up again with another phone number. Nothing stops it today (`research_notes/App Store readiness/audit-user-flows.md`, section 4).
- **Measure for 1.0:** no technical block. Every account needs a verified phone **To build (C1)** [[OWNER: SMS provider — proposed: Twilio]], so coming back needs a new number and a new SIM. When a returning person is reported, or recognised from a report, the moderator suspends the new account too, and records it as ban evasion (A15).
- **After 1.0:** consider refusing re-registration from the same Apple or Google identity or push token.
- **Review:** count ban-evasion cases at every review (section 7.3). Two or more in a quarter brings forward the technical measure.

#### 5.4.5 Child sexual exploitation and abuse: reports to the NCA (s.66)

As a UK provider, Resbite Ltd must report detected, unreported CSEA content to the National Crime Agency (s.66; S.I. 2026/262 (x)). The commencement date (7 April 2026 or 3 November 2025) and the NCA's onboarding steps are UNVERIFIED and must be checked before launch (gap analysis UGC-8). A15 and A22 set the path: **preserve** under a legal hold, **report to the NCA**, **suspend and ban** the account (the Auth ban, A15 section 8.2), and **never forward or copy** the content **To build (A15, A22, C6)**.

#### 5.4.6 Under-18 accounts

The 18+ limit is stated in the Terms and enforced the same way for everyone (gap analysis UGC-11; LAW-37). A15 holds the rule; A14 section 6 records it: reasonable grounds, suspend, ask for no more proof than is proportionate, delete the account and its data, and record the case for A14's review **To build (A15, C6, C2)**.

#### 5.4.7 People who are not users

An "affected person" (someone in the UK who is the subject of content, in a group it targets, or the parent or carer of a child user) can report illegal content and complain without an account (ss.20(2) and 21 (x)). At 1.0 they use `/support`: the support address, the contact form and a report route **To build (A4, D1, F1)**. A guest a host removed, who can no longer report the host in the app, uses the same route.

#### 5.4.8 Evidence and legal holds

Deletion and purge jobs must not destroy evidence that a report, a police request or an NCA report needs. A legal hold pauses them for the records it names **To build (C2, C3, C6, A22)**.

### 5.5 Risks accepted for 1.0

| Risk | Why we accept it for now | What would change it |
|---|---|---|
| Harassment, stalking, threats and abuse at medium | It comes with meeting in person. The controls bring it to low-medium | Reports at the first review |
| A suspended person returns with a new number | Phone verification raises the cost; re-suspension on report | Two or more cases in a quarter |
| A title or cover cannot be reported as such, only through its host (D-17) | Reporting the host sits on the same page; the filter covers titles **To build (C7)** and removal scripts cover covers **To build (C6)** | Any complaint that this route is hard to use |
| One owner plus one backup run moderation | Small service; push alerts on each report | Volume that strains the 24-hour target |
| Moderation needs the hosted project's SQL editor; there is no moderation screen | Small volume; written scripts | Volume, or a second backup |

---

## 6. Freedom of expression and privacy (s.22)

When we chose and put in place these measures, we had particular regard to users' right to freedom of expression within the law, and to protecting them from breaches of privacy law (s.22(2)–(3), text not re-read).

**Freedom of expression**
- The rules target illegal content and clear abuse, not opinions: "Be kind. No harassment, hate, threats or spam."
- The blocked-terms filter is deliberately narrow: 37 whole-word terms of clear slurs, explicit threats, sexual harassment and scam spam. It refuses a message before sending with a neutral line ("That message can't be sent.") and stores nothing. A false match can be raised as a complaint about proactive technology (ICU D11).
- Nothing is removed automatically after posting. Removal follows a person's review of a report.
- A removed message reads "Message removed by Resbite" to everyone in the chat. A suspended person gets the reasons and the appeal route **To build (A15, B6)**.
- Every removal and suspension can be appealed (ICU D9, D10) **To build (A5)**.
- A block hides someone only from the blocker. There are no hidden penalties.
- Hosts control their own resbite (who joins, which messages stay). A guest who disagrees can complain through `/support`.

**Privacy**
- No one scans private chats. The only automated check is the filter at the moment of sending.
- The team sees chat content only through a report: the report holds a frozen copy of the reported message, and nothing else of the chat (`qa/chat-release/README.md:837`).
- The backup moderator's Supabase role can technically read all data. Written instructions, a confidentiality agreement, MFA and access reviews limit this (A24, F16; DPIA A9) **To build (A24, C5, F16)**.
- Reports are deleted 180 days after closing (decision R-Q3; `supabase/ops/purge-closed-reports.sql`), with a scheduled job **To build (C3)**.
- ICU H1 checks never sample private chats without consent (section 5.4.2).
- Phone numbers are never shown to other users, and photo metadata is stripped.
- Chat text appears in push previews, sent through Expo in the US; this is disclosed in the privacy notice (decision D-13) **To build (A1)**.
- Reports hold allegations of offences, which are criminal offence data. The Article 10 condition is a question for the solicitor (decision D-22; `docs/compliance/appropriate-policy-document.md`).

---

## 7. Step 4: governance, records and review (s.23)

### 7.1 Sign-off and reporting

- The accountable individual signs off this record and each review [[OWNER: sign-off date by the accountable individual, and the date the board of Resbite Ltd noted it — proposed: after the solicitor's review and once every "To build" item in section 1.7 is live, before the 1.0 submission]].
- The board of Resbite Ltd is told the outcome of each review, including the residual risks in section 5.5. The board's note is kept in the company's records, outside this repo.

### 7.2 Records kept

| Record | Where | Kept for |
|---|---|---|
| This assessment, each version | This file, under version control | At least three years (Ofcom record-keeping guidance (x); law report LAW-35); in practice, every version stays in the repo's history |
| The Codes measures taken and the measures that do not apply, with reasons | Sections 5.1 to 5.3 of this file | As above |
| The children's access assessment | `docs/compliance/childrens-access-assessment.md` (A14) | As above |
| The moderation standard | `docs/compliance/moderation-standard.md` (A15) | As above |
| Reports and their outcomes | `private.reports` on the hosted project | 180 days after closing |
| Support, complaint, appeal, intimate image, NCA and law-enforcement case records | Outside the repo, in the tool listed in the vendor register (A18) | 24 months after the case closes, longer under a legal hold (D-8) |
| Counts for each review (section 7.3) | The review's entry in section 7.6 of this file | With this file |

Records hold no names, phone numbers, emails or account ids.

### 7.3 What we monitor

Counts only, gathered for each review:

- reports, by reason, and the action taken;
- time from report to action: the median and the longest; any report past 24 hours, and any intimate image report past 48 hours;
- suspensions, appeals and appeal outcomes;
- intimate image reports and takedowns;
- reports to the NCA; ICU H1 account removals;
- ban-evasion cases;
- confirmed under-18 accounts (for A14);
- complaints from people who are not users;
- the average number of monthly active UK users over the last six months (the Codes' method, paras 5.7–5.10), to watch the 700,000 and 7 million thresholds. How to count it is an open point (section 8, point 6).

### 7.4 Review dates

- **First review:** three months after the 1.0 release goes live, and no later than **17 May 2027**. It re-tests every rating against real reports.
- **Then:** at least every **12 months** (by 17 May 2028 at the latest after the first review), together with A14 and the records of processing (F15).
- **Also:** whenever Ofcom changes its Risk Profiles (s.9(3), text not re-read), and before any change in section 7.5.

### 7.5 Changes that need a new assessment first

Before any of these ships, this assessment is redone:

- images, video, voice or files in chat; livestreaming;
- direct messages outside a resbite;
- public profiles, a people search, a feed, a directory of public events, or a recommender;
- removing host approval for link joiners, or raising the guest-bringing limits;
- paid features, payments or a marketplace;
- a new storefront or region (the EU brings the A21 pack);
- any feature for, or marketing to, younger users, or a change to A14's outcome;
- end-to-end encryption of chat (it changes what moderation can see);
- read receipts, "last seen" or live location;
- content made by AI inside the app.

Also review at once if:

- the first confirmed report arrives in a kind rated negligible or low (for fraud, the first confirmed fraud report);
- Ofcom publishes Code measures that apply to all services, or the remaining additional safety measures;
- the s.20A intimate image duty's commencement is confirmed;
- monthly active UK users pass 100,000 (an early warning, well before the 700,000 threshold in ICU C9, C10 and C14).

### 7.6 Review log

| Date | Version | Reviewer (role) | What changed |
|---|---|---|---|
| 17 November 2026 | 1.0 draft | The owner | First assessment, describing the 1.0 target state. Not signed off |

---

## 8. Open questions

1. **Measure numbers and in-force versions.** Ofcom's site refused automated reads. The measures were read from the Codes laid in December 2024 and the amendments shown on gov.uk. Check every number in section 5 against the consolidated Codes in force before sign-off, especially ICU C15 (from search extracts) and any self-harm and cyberflashing changes.
2. **Risk-level tables.** Check the levels in section 4 against Ofcom's risk-level tables in the risk assessment guidance v2.0, which could not be read directly.
3. **The Terms (A3) must carry ICU G1 in full**: separate statements for terrorism, CSEA and other priority illegal content on how long such content may stay up; the swift takedown; the blocked-terms filter as proactive technology (kind, when it runs, how it works); and the complaints process. This record assumes they do.
4. **ICU D4 needs a copy change not in the gap analysis.** The in-app report thanks today reads "Thanks. The Resbite team will look at it." (`mobile/src/domain/safetyCopy.ts:18`). To meet D4 it should give the review time, for example "We aim to review reports within 24 hours." Proposed as part of B7.
5. **"Communicated privately".** Whether resbite chats count as content communicated privately under Ofcom's guidance (relevant to ICU H1.8) is our judgement, for the solicitor.
6. **Counting monthly active UK users.** `private.app_sessions` keeps only the first and last session per account, so past monthly counts cannot be rebuilt. A monthly count, taken from the hosted project and recorded as a number, is proposed.
7. **The NCA.** Confirm the s.66 commencement date and register with the NCA's reporting route before launch (gap analysis UGC-8).
8. **Ofcom's later decisions.** Check, at sign-off, whether the autumn 2026 additional safety measures statement has been published and whether any new measure applies to all services.
9. **Team-run deletion.** Removing an account under ICU H1, or deleting an under-18 account, needs the team to erase an account that may not be able to sign in. The gap analysis lists self-service deletion (C2), deletion requests from banned accounts through the privacy inbox (A16, D8) and team scripts (C6), but no item names a team-run erasure path. C2 or C6 should include one.
10. **No "last seen" or read receipts.** Section 4.2 (kind 6) relies on chat read positions being used only for a person's own unread count (`supabase/migrations/20261111140000_chat_core.sql:256,344`). Adding read receipts or presence would be a change under section 7.5.

---

## 9. Sources

Read directly on 17 November 2026 unless marked **(x)** (search-engine extracts only; Ofcom and legislation.gov.uk refused automated reads).

- Online Safety Act 2023, ss.3, 4, 9, 10, 20–23, 49–50, 66, 100, 179, 181, 183, 226 and Schedule 1 (text not re-read): https://www.legislation.gov.uk/ukpga/2023/50
- Ofcom, Illegal content Codes of Practice for user-to-user services, as submitted to the Secretary of State on 16 December 2024 (issued 24 February 2025, in force 17 March 2025), gov.uk copy: https://assets.publishing.service.gov.uk/media/6762c7dfff2c870561bde79f/draft-illegal-content-codes-of-practice-for-user-to-user-services.pdf
- Draft amendments to the illegal content Codes for user-to-user services (ICU C14, hash matching for intimate image abuse), gov.uk: https://www.gov.uk/government/publications/online-safety-act-draft-amendments-to-the-illegal-content-codes-of-practice/draft-amendments-to-illegal-content-codes-of-practice-for-user-to-user-services
- Explanatory memorandum to the draft amendments (intimate image hash matching), gov.uk: https://assets.publishing.service.gov.uk/media/6a0da2b64ea6d8f759662dc6/EM_to_Draft_Amendments_Illegal_Content_Codes.pdf
- Explanatory memorandum for the crisis response measures, gov.uk: https://assets.publishing.service.gov.uk/media/6a3161fd45124bc4cb61e1e0/Shared_EM_to_for_Crisis_Response_Measures.pdf
- Ofcom, Illegal content Codes, 9 September 2026 version (x): https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/detecting-intimate-image-abuse/illegal-content-codes-of-practice-for-user-to-user-services-9sep2026.pdf
- Ofcom, Amendments (No. 2) to the illegal content Codes, issued 12 October 2026, in force 2 November 2026 (x): https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/protecting-children/illegal-harms/amendments-to-illegal-content-codes-of-practice-for-user-to-user-services-incorporating-amendments-issued-12-october-2026-in-force-2-november-2026.pdf
- Ofcom, Risk Assessment Guidance and Risk Profiles, v2.0, 25 June 2026 (x): https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/updates/risk-assessment-guidance-and-risk-profiles.pdf
- Ofcom, Statement: New priority offences — serious self-harm and cyberflashing, 25 June 2026 (x): https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/statement-new-priority-offences-serious-self-harm-and-cyberflashing
- Ofcom, Statement: Detecting intimate image abuse, 18 May 2026 (x): https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/statement-detecting-intimate-image-abuse
- Ofcom, Statement: Crisis response protocol, 9 June 2026 (x): https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/statement-crisis-response-protocol
- Ofcom, Record-Keeping and Review Guidance, v3.0, 25 June 2026 (x): https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/updates/record-keeping-and-review-guidance.pdf
- Ofcom, Online Safety industry bulletin, October 2026 (x): https://www.ofcom.org.uk/online-safety/protecting-children/online-safety-industry-bulletin-october-2026
- gov.uk, "Stronger laws for tech firms to ensure you don't see unsolicited nudes" (cyberflashing a priority offence from 8 January 2026): https://www.gov.uk/government/news/stronger-laws-for-tech-firms-to-ensure-you-dont-see-unsolicited-nudes
- gov.uk, Crime and Policing Act 2026 intimate image abuse factsheet (no commencement date given): https://www.gov.uk/government/publications/crime-and-policing-act-2026-factsheets/crime-and-policing-act-2026-intimate-image-abuse-factsheet
- Online Safety Act 2023 (Commencement No. 7) Regulations, S.I. 2026/262 (x): https://www.legislation.gov.uk/uksi/2026/262/made
- The gap analysis and its sources: `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`; `research_notes/App Store readiness/uk-eu-law.md` (LAW-26 to LAW-38); `research_notes/App Store readiness/audit-user-flows.md`; `research_notes/App Store readiness/audit-data-inventory.md` (DI)
