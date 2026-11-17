# Children's access assessment, with the Children's code "likely to be accessed" assessment

| | |
|---|---|
| **Owner of this record** | The owner, as the individual accountable for the Online Safety Act duties (ICU A2; `docs/compliance/osa-illegal-content-risk-assessment.md`, section 5.4.1) |
| **Version** | 1.0 — draft for solicitor review (decision D-12). Not signed off. |
| **Date** | 17 November 2026 |
| **Next review** | The evidence in section 4.2 is checked again three months after the 1.0 release goes live, and no later than 17 May 2027. A full new assessment by **17 November 2027** at the latest, then at least every 12 months, and sooner on any trigger in section 7. |
| **Purpose** | To decide, and record, whether children can access Resbite and whether they are likely to (Online Safety Act 2023 ss.35–37), and whether Resbite is "likely to be accessed by children" under the ICO's Children's code. |
| **Provider and controller** | Resbite Ltd, a private limited company registered in England and Wales, company number 12450334. Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom. Contacts: support@resbite.com and privacy@resbite.com |
| **Gap analysis item** | A14, closing rows DOC-5 and PRV-12, and ASC-17 in part, of `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md` |

## Placeholders to fill

1. [[OWNER: the role of the individual accountable under ICU A2 — proposed: the owner, as a director of Resbite Ltd; the name is recorded in the company's own governance records, not in this repo]] (section 8)
2. [[OWNER: the number of accounts whose stored optional date of birth showed an age under 18 when it was entered, counted once on the hosted project before C9 erases the values, recording the number only and never who — proposed: count it in the C9 sitting and write the number here]] (section 4.2)
3. [[OWNER: the answer from Apple Developer Support or the solicitor on whether the UK is a region where developers must use the Declared Age Range API, and the result of trying to download an 18+ app from an unconfirmed UK Apple Account — proposed: ask and test before submission (decision D-16, gap analysis ASC-17)]] (sections 3.2, 4.3)
4. [[OWNER: sign-off date by the accountable individual — proposed: after the solicitor's review and once the "To build" items in section 2 are live, before the 1.0 submission]] (section 8)

## How to read this record

- **Target state.** This record describes Resbite **as it will be at version 1.0**, after workstreams B, C, D and F of the gap analysis are built, using the owner's answers and the rulings of 17 November 2026 (AS-D1 to AS-D8 and AS-R1 to AS-R9 in `knowledge-base/08-decisions.md`) and otherwise the gap analysis' recommended default for every owner decision D-3 to D-25. A statement that depends on something not yet built carries the item id in bold, for example **To build (B2)**. Sign-off waits until those items are live.
- **Evidence.** Each fact was checked in the code on 17 November 2026 (branch `app-store-readiness` at `de8ba6a`). Hosted facts come from the repo's records only. Where the code and the gap analysis disagree, this record follows the code and says so.
- **The data protection regulator** is the Information Commission, which took over the Information Commissioner's Office's functions on 30 September 2026 and still uses the name ICO (ico.org.uk). This record calls it "the ICO".
- **(x)** marks an Ofcom, ICO or legislation page read only through search-engine extracts, because those sites refused automated reads on 17 November 2026. **UNVERIFIED** marks a point not confirmed from a primary source.
- **No personal data.** Roles only. Under-18 cases are recorded here as counts, never as people.

---

## 1. What this record decides

Two tests, one set of evidence.

**The Online Safety Act children's access assessment** (ss.35–37; Ofcom's children's access assessments guidance, 24 April 2025 (x)):

- **Stage 1.** Is it possible for children to access the service, or part of it? A provider may answer "no" only if it uses age verification or age estimation that is highly effective, so that children are not normally able to get in (s.35(2), text not re-read). Self-declaration is not age assurance (Ofcom (x)).
- **Stage 2.** If children can access it, is the **child user condition** met? It is met if there is a significant number of children who use the service, or the service is of a kind likely to attract a significant number of children (s.35(3), text not re-read).
- If both answers are yes, the service is "likely to be accessed by children". A children's risk assessment and the protection-of-children duties follow (ss.11–12; law report LAW-33).
- A service that has not done its first assessment is treated as likely to be accessed by children until it does (s.37, from a legislation.gov.uk extract (x)).

**The ICO's Children's code** (Data Protection Act 2018 s.123; ICO guidance "Likely to be accessed by children" (x)):

- The code applies to online services **likely to be accessed by children**, even adult-only ones. "Likely" means more probable than not, judged on the service in reality: its users, its appeal to children and its access controls (law report LAW-19 (x)).
- Since 5 February 2026, providers of such services must also weigh the "children's higher protection matters" (UK GDPR Art 25(1A)–(1B) (x)).

**A child** is anyone under 18 in both tests.

**Parts of the service assessed:** the iPhone app; the link web site `link.resbite.com` (event pages `/r/`, invitation pages `/i/`, the legacy `/invite` page, and the legal pages at 1.0); and the backend that serves both. The illegal content risk assessment (A13, section 1.2) describes them.

---

## 2. The service in brief

Resbite helps **adults** plan small get-togethers with people they know: a host makes a plan (a "resbite", one-off or weekly), invites people, and the people going chat about it. It is free, with no ads, no tracking and no in-app purchases (owner, 17 November 2026). It is for people aged 18 and over (owner, 17 November 2026).

At 1.0:

- every account has a verified phone number **To build (C1)** and confirms "I'm 18 or over" with the current Terms, on every route that creates an account **To build (B2, C8, D3, D4)**;
- the App Store age rating is overridden to **18+** **To build (E4)**;
- the optional date of birth, second phone, city and interests are removed **To build (B11, C9)**;
- the Wellness tab is hidden **To build (B4)**;
- there is no way to search for people, no public profiles, no feed and no recommender (A13, section 3.3);
- a "Child safety" report reason and the under-18 rule in section 6 are in place **To build (B7, C7, A15)**.

---

## 3. Stage 1: is it possible for children to access the service?

### 3.1 The test

Children can be treated as unable to access a service only where highly effective age assurance, with access controls, keeps them out (s.35(2), text not re-read; Ofcom (x)). Ofcom's guidance on highly effective age assurance (24 April 2025 (x)) does not count self-declaration.

### 3.2 The checks Resbite has at 1.0

| Check | What it does | Age verification or estimation used on the service? |
|---|---|---|
| "I'm 18 or over" tick with the Terms, on every account **To build (B2, C8, D3, D4)** | The person says they are 18 or over | **No.** Self-declaration |
| Verified phone number on every account **To build (C1)** | Proves the person controls a number | **No.** Says nothing about age |
| Sign in with Apple, Google, email and password | Signs the person in | **No.** No age data is asked for or used |
| App Store age rating 18+ **To build (E4)** | Apple shows the rating. Apple's parental controls can block apps above a chosen rating on a child's device (Apple feature; not re-checked for this record) | **No.** It works in Apple's store, only where a parent has set limits, and not on the web |
| Apple's UK adult confirmation | Apple's UK page (published 26 October 2026, read 17 November 2026) says adults must confirm they are 18 or over to use certain services or features, by a credit card, a passport or driving licence scan, a PASS proof-of-age card, or a selfie; unconfirmed adults get Apple's web content filter and Communication Safety switched on. Apple's general page says people may need to confirm before downloading 18+ apps "depending on your state, country or region". Whether this blocks 18+ downloads in the UK is **UNVERIFIED** (placeholder 3) | **No.** It is Apple's check at download, not one used on Resbite. It does not cover the web site or web-only accounts, and a phone can be handed to someone else after download |
| Apple's Declared Age Range API | Would give the app an age range from the Apple Account | **Not built** (decision D-16). Whether it would count as highly effective age assurance is UNVERIFIED |

### 3.3 Parts anyone can reach without any check

- An **event link** page (`/r/`) shows the plan's title, the host's name, the time, the area and the cover to anyone holding the link, and lets them ask to join (`supabase/migrations/20261031120000_creating_a_resbite.sql:247-264`).
- An **invitation** page (`/i/`) lets the invited person answer by phone, creating a web-only account with the 18+ tick (`links/assets/personal-flow.mjs:24-25`).
- The legal pages (`/privacy`, `/terms`, `/support`, `/delete-account`) **To build (D1)**.

### 3.4 Stage 1 conclusion

**Yes, it is possible for children to access Resbite.** None of its checks is age verification or age estimation used on the service. So the assessment goes on to stage 2.

---

## 4. Stage 2: the child user condition

### 4.1 The test

- **(a)** Is there a significant number of children who are users of the service? **(b)** Is the service of a kind likely to attract a significant number of child users? Either is enough (s.35(3), text not re-read).
- A "significant number" includes a number that is significant **in proportion to the total number of UK users** (s.35, text not re-read; Ofcom (x)). Ofcom says it means a number that is material in the context of the service, that even a relatively small proportion may count, and that providers should **err on the side of caution** (x).
- The answer must rest on evidence of **who actually uses** the service, not who it is meant for, and not on self-declared ages alone (Ofcom (x)).
- Factors Ofcom and the ICO name (x): whether the service benefits children; whether its content or design appeals to them; whether children are part of the business model, marketing or growth plans; internal evidence such as reports about under-18 users and accounts removed for age; and external evidence such as market research.

**What this means for a small service.** Because "significant" is measured in proportion to the user base, a handful of children could be significant while Resbite is small. That is why the thresholds in section 5.3 are low.

### 4.2 Evidence about actual users (test (a))

| Evidence | What it shows | Source |
|---|---|---|
| 14 confirmed accounts on 16 November 2026, testers in the UK and Europe | A very small base, recruited before any public listing | `docs/implementation-status.md:3` |
| No reports at all, so no report about an under-18 user; no suspensions, so no account removed for age | No internal sign of child users. Weak evidence: there is little use to report on | `qa/open-beta-2026-11-16/hosted-counts-after.json` (`private.reports` 0, `private.suspensions` 0) |
| Only 4 age attestations for 14 confirmed accounts | Most current accounts never ticked 18+, because the tick appeared only on some routes (gap analysis SI-7). At 1.0 every account accepts the 18+ tick and the new Terms (decision D-11) **To build (B2, C8)** | `qa/open-beta-2026-11-16/hosted-counts-after.json` (`private.age_attestations` 4) |
| Optional dates of birth stored before 1.0 | Any date from 1900 to today was accepted, so a stored date could show an under-18 user (`mobile/src/domain/registration.ts:35-45`). **Not checked for this record**: it needs hosted access. (placeholder 2) | gap analysis SI-8 |
| No market research or external data about Resbite's users | No external evidence either way | — |

**Reading (a):** on the evidence available there is no significant number of child users. The evidence is thin, so (b) carries most of the weight.

### 4.3 Evidence about appeal to children (test (b))

**Pointing away from children**

| Factor | Evidence |
|---|---|
| **Purpose** | Adults arranging get-togethers with people they know. The service is 18+ only (owner, 17 November 2026) |
| **Content** | The activity ideas are coffee together, a BBQ, a board game night, a book club, building a snowman, a bike ride, painting, a picnic in the park, a spa day, a walk and talk, and wine tasting (`mobile/assets/activities/`). The welcome screen says "Get together" and "Small plans with your people." (`mobile/app/index.tsx:53-54`); the introduction says "A coffee, a bike ride, a little creativity." and "Turn "we should catch up" into a real invitation." (`mobile/src/domain/accountCopy.ts:49-53`) |
| **Design** | Muted pastel line drawings of adults (checked: `mobile/assets/activities/building-a-snowman.png`). No games, points, streaks, rewards, stickers, characters or avatars. No feed, video or content to browse. The Wellness tab is hidden **To build (B4)** |
| **Business model** | Free, no ads, no purchases, no tracking. Children are not part of the business model, marketing or growth plans: the service is 18+ (owner, 17 November 2026). No marketing plan or campaign is recorded in the repo |
| **The store listing** | Age rating 18+ **To build (E4)**; category Social Networking (decision D-18); listing copy approved by the owner and screenshots using fictional adult personas **To build (E8, E9)**. The marketing site the link site points to is not in this repo; its check is **To build (F18)** |
| **How people arrive** | There is no search, discovery or recommender. A child could reach Resbite only through an adult's invitation by phone, an event link, or a guest bringing them (A13, section 3.4) |
| **Account checks** | The 18+ tick and the Terms on every account **To build (B2, C8, D3, D4)**; a verified phone **To build (C1)**; the 18+ rating, which Apple's parental controls can use |
| **Apple's UK adult confirmation** | If it blocks 18+ downloads for unconfirmed UK accounts, it keeps most children from installing the app. **UNVERIFIED** (placeholder 3). It never covers the web route |

**Pointing towards children**

| Factor | Evidence |
|---|---|
| **The tick can be ticked by anyone** | Self-declared ages are unreliable: Ofcom's 2024 research found that 22% of 8–17-year-olds with a social media profile had a user age of 18 or over (Ofcom children's online user ages research, November 2024 (x)) |
| **The purpose is not adult-only by nature** | Planning get-togethers and group chat are things teenagers do too, so a teenager could find Resbite useful (our inference) |
| **Family plans** | Some ideas suit families (building a snowman, a picnic, a board game night). A parent may plan a family outing and want to invite a teenage child, who could join only by ticking 18+ falsely |
| **Open links** | An event link can be posted anywhere. A child can open its public page without any check and ask to join; the host must approve |
| **Phones** | A verified phone number shows nothing about age |
| **The web route** | Web-only accounts are made on the link site with only the tick, outside any Apple check |
| **Earlier builds** | Account details accepted an under-18 date of birth (`mobile/src/domain/registration.ts:35-45`). This is removed at 1.0 **To build (B11, C9)** |

### 4.4 Weighing

- Nothing about Resbite is aimed at children: not its purpose, content, design, business model or listing. It has no features that commonly draw children (games, video, feeds, rewards, discovery).
- Children cannot find Resbite or its users from inside the service. They can arrive only through an adult who invites them or shares a link, and then only by saying they are 18 or over.
- The real routes for a child to get in are a false tick, a family plan, or a link posted publicly. These are possible, but on present evidence they do not add up to a significant number of child users, or to a service of a kind likely to attract them.
- The evidence base is small. Erring on the side of caution, we do not treat the absence of reports as proof. We set low thresholds that would reopen the conclusion (section 5.3), and an early check of the evidence (section 7).

---

## 5. Outcome

### 5.1 Online Safety Act

| Question | Answer |
|---|---|
| Is it possible for children to access the service? | **Yes** (section 3.4) |
| Is the child user condition met? | **No** (section 4.4) |
| Is the service "likely to be accessed by children"? | **No** |

So, for now:

- no children's risk assessment and no protection-of-children duties (ss.11–12);
- Codes measures for services likely to be accessed by children (ICU D3, D5) do not apply (A13, section 5.2);
- the grooming rating in A13 (section 4.2, kind 2C) stays at low, because it depends on this outcome.

### 5.2 ICO Children's code

Resbite is **not likely to be accessed by children**: on the evidence, access by children is not more probable than not. The code's standards and the children's higher protection matters (UK GDPR Art 25(1A)–(1B)) do not apply. Resbite keeps the design choices that protect everyone anyway: no profiling, no tracking, no ads, minimal data, and no public profiles.

### 5.3 What would reopen the outcome

These are proposed thresholds for the owner and the solicitor to confirm (section 9, point 1):

- **Each confirmed under-18 account:** the accountable individual looks at this record again within 14 days and notes the case count in the review log.
- **A full new assessment**, presuming the child user condition is met unless the evidence shows otherwise, if:
  - a second confirmed under-18 account is found within any six months; or
  - confirmed under-18 accounts reach 1% of the monthly active UK users in any 12 months; or
  - there is evidence that the service is promoted to, or popular with, under-18s (press, App Store reviews, schools); or
  - any trigger in section 7.2 happens.

### 5.4 If the outcome changes

- Carry out a children's risk assessment within three months (Ofcom (x); law report LAW-33), and apply the protection-of-children duties and Codes; or
- bring in highly effective age assurance with access controls, so children are not normally able to get in, and record a new stage 1 (decision D-16; whether Apple's Declared Age Range qualifies is UNVERIFIED); and
- apply the ICO's Children's code to all users, or to those not shown to be adults;
- reopen A13 (grooming to at least medium; ICU D3, D5, and F1 and F2 where they apply) and the DPIA (A9, `docs/compliance/dpia.md`).

---

## 6. When an under-18 account is found (the A15 rule)

The 18+ limit is in the Terms (A3) and is enforced the same way for everyone. The moderation standard (A15, `docs/compliance/moderation-standard.md`) holds the operating steps **To build (A15)**. The rule is:

1. **Reasonable grounds.** For example: the person says they are under 18 (in chat, a report, or an email); a parent or carer reports it with details, through the app or `/support` **To build (D1, F1)**; a "Child safety" report gives specific signs, such as a stated age or school year **To build (B7, C7)**; a notice from the police or Apple. On their own, a young-looking photo or a vague claim are not reasonable grounds; the moderator looks at what was reported and at what the account shows others (name, photo, titles), and never browses private chats to check.
2. **Suspend at once.** Suspend the account by its id **To build (C6)**. The suspended screen gives the support address and the route to delete the account (decision D-19) **To build (B6)**.
3. **Ask for no more proof than is proportionate.** We never ask for an identity document by default. If the person says they are 18 or over, we weigh that against what raised the concern. If doubt remains, the account stays suspended and the person may appeal (A5). Any proof we do accept is looked at once and not kept; only the outcome is recorded. How far this may go is a question for the solicitor and the DPIA (section 9, point 2).
4. **Delete the account and its data.** Unless the person shows they are 18 or over, the account and its data are deleted within 30 days, the stated deletion time frame (decision D-4). The person may delete it themselves first (D-19). For an account that cannot or does not act, the owner runs the deletion script, which follows the same lifecycle as the app, with the cancellations and the receipt (ruling AS-R3; section 9, point 3) **To build (C6)**. A legal hold pauses the erasure of records that a report or a police or NCA referral needs **To build (C2, C6, A22)**.
5. **Protect the child.** If an adult has contacted the child in a sexual way, or there is any sign of abuse, the CSEA path applies: preserve, report to the National Crime Agency, suspend and ban the adult, and never forward the content (A13, section 5.4.5; A15; A22). A risk to life means 999 first (A22).
6. **Record the case.** The case record (the grounds, the action, the dates, the outcome) is kept outside the repo for 24 months after closing (decision D-8). This record holds only the count, in the review log (section 7.3).

---

## 7. Monitoring and review

### 7.1 What we watch

Counts only, for each review:

- confirmed under-18 accounts, and how each was found (report, parent, own statement, other);
- "Child safety" reports, and their outcomes;
- complaints from parents or carers through `/support`;
- App Store reviews and press that mention children, school or age (read by the owner);
- the average number of monthly active UK users, to measure any count against (A13, section 7.3).

### 7.2 When we review

- **Early evidence check:** with A13's first review, three months after the 1.0 release goes live, and no later than **17 May 2027**.
- **Full new assessment:** at least every 12 months (s.36, text not re-read): by **17 November 2027** at the latest. Done together with A13 and the records of processing (F15).
- **Before any significant change**, for example:
  - features that may appeal to younger people (games, rewards, video, stickers, a feed, discovery);
  - family features, or features for schools, clubs or teams with younger members;
  - marketing that reaches under-18s, or a change of App Store category or rating;
  - removing or weakening the 18+ tick, or adding Declared Age Range or another age check;
  - a new storefront or platform (for example the EU, or Android);
  - paid features.
- **On evidence** that age checks work less well than assumed, or that more children are using the service (s.36, text not re-read), including the thresholds in section 5.3.

### 7.3 Review log

| Date | Version | Reviewer (role) | Confirmed under-18 accounts since last review | Outcome |
|---|---|---|---|---|
| 17 November 2026 | 1.0 draft | The owner | Not checked (placeholder 2) | Children can access; child user condition not met; not likely to be accessed by children. Not signed off |

---

## 8. Record keeping and sign-off

- The outcome is recorded whatever it is (Ofcom (x)). This file is the written record. Each version is kept for at least three years (Ofcom record-keeping guidance (x); law report LAW-35); in practice, every version stays in the repo's history.
- The accountable individual signs off this record: [[OWNER: the role of the individual accountable under ICU A2 — proposed: the owner, as a director of Resbite Ltd; the name is recorded in the company's own governance records, not in this repo]], on [[OWNER: sign-off date by the accountable individual — proposed: after the solicitor's review and once the "To build" items in section 2 are live, before the 1.0 submission]].
- The board of Resbite Ltd is told the outcome with A13's review (A13, section 7.1).

---

## 9. Open questions

1. **Thresholds.** The thresholds in section 5.3 (14-day look; a second case in six months; 1% of monthly active UK users) are proposals. The owner and the solicitor should confirm them.
2. **Proof of age.** Whether, and how, Resbite may check the age of a person who disputes an under-18 finding without keeping identity documents. For the solicitor (listed in `docs/legal/README.md`, "Questions for the solicitor") and the DPIA (A9).
3. **Team-run deletion.** The rule in section 6 needs the team to erase an account that is suspended and may not act. Decided by ruling AS-R3: an owner-run deletion script runs the same lifecycle as the app for banned, web-only and under-18 accounts. It joins C6.
4. **Apple's UK check.** Whether the UK is a region where Apple blocks 18+ downloads for unconfirmed accounts, and where developers must use the Declared Age Range API (gap analysis ASC-17, decision D-16). The outcome above does not rely on it; if it applies, it strengthens section 4.3.
5. **Stored dates of birth.** Count the under-18 dates before C9 erases them (placeholder 2). A non-zero count is direct evidence for section 4.2 and should be weighed before sign-off.
6. **The Act's text.** Sections 35–37 were read through extracts only; check the exact wording of s.35(2) to (5), s.36 and s.37 against legislation.gov.uk.

---

## 10. Sources

Read directly on 17 November 2026 unless marked **(x)** (search-engine extracts only; Ofcom, the ICO and legislation.gov.uk refused automated reads).

- Online Safety Act 2023, ss.11–12, 35–37 (text not re-read; extracts (x)): https://www.legislation.gov.uk/ukpga/2023/50/section/35 ; https://www.legislation.gov.uk/ukpga/2023/50/section/36 ; https://www.legislation.gov.uk/ukpga/2023/50/section/37
- Ofcom, Children's access assessments guidance, 24 April 2025 (x): https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-1-10-weeks/statement-age-assurance-and-childrens-access/childrens-access-assessments-guidance.pdf
- Ofcom, Quick guide to children's access assessments (x): https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/quick-guide-to-childrens-access-assessments
- Ofcom, Guidance on highly effective age assurance, 24 April 2025 (x): https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-1-10-weeks/statement-protecting-children-from-harms-online/main-document/guidance-on-highly-effective-age-assurance-part-3-guidance-.pdf
- Ofcom, Record-Keeping and Review Guidance, v3.0, 25 June 2026 (x): https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/updates/record-keeping-and-review-guidance.pdf
- Ofcom, children's online user ages research, wave 3, November 2024 (x): https://www.ofcom.org.uk/siteassets/resources/documents/research-and-data/online-research/keeping-children-safe-online/childrens-online-user-ages/2024-nov/ofcom-childrens-user-ages-2024-wave-3-chart-pack-.pdf
- Ofcom–ICO joint statement on age assurance (x): https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/other/ofcom-ico-joint-statement-on-age-assurance.pdf
- ICO, Likely to be accessed by children: FAQs, factors and case studies (x): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/likely-to-be-accessed-by-children/
- ICO, Children's code: services covered (x): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/
- gov.uk, The Information Commission succeeds the ICO: https://www.gov.uk/government/news/information-commission-succeeds-the-ico-as-uks-data-protection-regulator
- Apple, UK adult confirmation (published 26 October 2026): https://support.apple.com/en-gb/126788
- Apple, "If you're asked to confirm that you're an adult" (published 26 October 2026): https://support.apple.com/en-gb/125662
- Apple, Age assurance Q&A for developers (via the gap analysis, [AAGE-QA]): https://developer.apple.com/support/age-assurance/
- The gap analysis and its sources: `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md` (DOC-5, PRV-12, ASC-17, SI-7, SI-8, UGC-11, D-16); `research_notes/App Store readiness/uk-eu-law.md` (LAW-19, LAW-32, LAW-33); `research_notes/App Store readiness/audit-user-flows.md`; `research_notes/App Store readiness/audit-data-inventory.md`
- The illegal content risk assessment: `docs/compliance/osa-illegal-content-risk-assessment.md` (A13)
