# UK and EU law for the first public App Store release

Researched 17 November 2026, read-only. This is a research note, not legal advice. A UK solicitor should review the documents it leads to before launch.

**Scope.** What the law requires of the operator of this app for UK users (primary), what changes if it is offered in the EU/EEA (conditional), and a short note on worldwide release. The operator is assumed to be a small UK private limited company; the owner must confirm this (LAW-1).

**Gates.** `legal-must`: the law requires it. `should`: strongly advised or regulator guidance, with real risk if skipped. `nice`: good practice. `submission-blocker`: only for things Apple checks at App Review.

**Method and limits.** `[n]` points to the numbered Sources list at the end.
- legislation.gov.uk, ico.org.uk, ofcom.org.uk and eur-lex.europa.eu all refused automated reads today (HTTP 202 with an empty body, or 403). Their content below comes from **search-engine extracts** of those exact pages, marked *(extract)*. Check each against the live page before relying on it.
- gov.uk, developer.apple.com, commission.europa.eu, digital-strategy.ec.europa.eu, supabase.com, vercel.com and expo.dev were read directly.
- The repo's earlier note `research_notes/Phone messaging providers/whatsapp-telegram-and-uk-rules.md` read PECR, UK GDPR Art 6 and 14 and the DUAA commencement orders directly on legislation.gov.uk on 3 November 2026. I reuse it for PECR regs 22 and 23 and the penalty changes [21].
- UK GDPR article texts I could not re-read today are stable since 2018. Where I rely on my own knowledge of an article, I say *(text not re-read)*.
- **UNVERIFIED** marks anything not confirmed from a primary source.

---

## 1. Facts about the app that drive the analysis

All claims are from the repo as at `main` db8a221.

| Fact | Evidence |
|---|---|
| Hosted backend is Supabase, London (eu-west-2), on the Pro plan; daily backups kept 7 days; logs 7 days | `docs/implementation-status.md:30`; `qa/b0-retention-proposal.md:22-24` |
| Chat (core, groups, safety) is **live** on the hosted project since 12–13 Nov 2026 | `supabase/tests/hosted-baseline/migrations.txt:24-26`; `qa/chat-release/README.md:862-869` |
| Open beta: any confirmed account may use the app since 16 Nov 2026 | `docs/implementation-status.md:3`; `knowledge-base/08-decisions.md:772` |
| **Account deletion is not live.** The deletion and cleanup migrations are local only; the build switch is off | Local files `supabase/migrations/20260918001316_account_deletion_lifecycle.sql`, `…20260923152816_orphan_profile_photo_cleanup.sql`, `…20260923152943_deletion_receipt_retention.sql`, `…20260929125858_deletion_intent_reservations.sql`, `…20261022120001_gi2_local_delivery_and_deletion.sql` are absent from `supabase/tests/hosted-baseline/migrations.txt:3-27`; `mobile/src/services/accountDeletion.ts:11-12`; `mobile/app/delete-account.tsx:161-166`; `mobile/.env.example:4-5` |
| Deletion functions still need a roster row or grant and a **confirmed email** (OB-D5) | `knowledge-base/08-decisions.md:776` |
| **Phone codes run in test mode:** `000000` works for any number whose code was requested in the last 10 minutes, and anonymous callers may use it | `supabase/migrations/20261027120000_phone_accounts.sql:15,77-98`; `supabase/migrations/20261030130000_phone_key.sql:61`; decision CI-D13 `knowledge-base/08-decisions.md:391` |
| Support address not set; it shows only when the build has it | `mobile/.env.example:11-14`; `mobile/app/data-privacy.tsx:28,138-147`; `qa/chat-release/README.md:864` |
| One moderator (the owner); backup reader (R-Q4) not named; moderation runs in the SQL editor | `qa/chat-release/README.md:864,869`; `knowledge-base/08-decisions.md:742,749` |
| Blocked-terms filter (37 terms) stops chat messages and announcements | `qa/chat-release/README.md:869`; `qa/chat-release/app-store-review-notes.md:22` |
| Report reasons: Harassment, Spam, Not appropriate, Something else. Reports kept 180 days after closing | `mobile/src/domain/safetyCopy.ts:14,85-86`; `supabase/migrations/20261111160000_chat_safety.sql:771`; `qa/chat-release/README.md:123` |
| 18+ is a self-declared tick, stored with a Terms version `2026-10` | `mobile/src/domain/guestAccount.ts:4,13-15`; `supabase/migrations/20261027120000_phone_accounts.sql:324-337` |
| Optional date of birth accepts **any date from 1900 to today**, so an under-18 date is accepted | `mobile/src/domain/registration.ts:35-45`; `supabase/migrations/20260923150902_atomic_registration_details.sql:39-49` |
| "Terms" and "Privacy Policy" are links only if `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_PRIVACY_URL` are set; neither is in `.env.example`. No Terms or privacy notice document exists in the repo | `mobile/src/design/TickRow.tsx:60-70`; `mobile/.env.example:1-14` |
| The link site shows Terms/Privacy links only if `TERMS_URL` / `PRIVACY_URL` are set (default empty) | `links/server/lib/options.mjs:16-18` |
| An old 2020 **website** privacy policy and terms name a UK limited company as controller, refer to EU GDPR and third-party cookies, and predate the app | `knowledge-base/audit/extracted-text/S0913--website-privacy-policy.txt:1`; `knowledge-base/audit/extracted-text/S0913--website-terms-conditions.txt:1` |
| The contact lookup sends the **numbers the host picks** (not the address book) to the server, which compares them with confirmed users' numbers; 500 a day per caller | `mobile/src/state/useContactInvites.ts:39-40`; `mobile/src/services/contactInvites.ts:112`; `supabase/migrations/20261028120000_contact_invitations.sql:49-77` |
| A **non-user's phone number is stored in plain digits** for each personal invitation, kept as long as the plan exists | `supabase/migrations/20261028120000_contact_invitations.sql:12-25` |
| The host sends invitations from their own Messages/WhatsApp with neutral pre-filled text | `mobile/src/domain/contactInvites.ts:191`; `mobile/app.json:17` |
| Push goes through Expo's push service (`exp.host`) to Apple; push tokens are stored | `supabase/functions/_shared/notification-adapters.ts:16`; `supabase/migrations/20261030120000_push_delivery.sql:22` |
| No analytics, crash-reporting or ad SDK in the app | `mobile/package.json:14-42` |
| Link site keeps a session per invitation in `localStorage`; the hosting brief says no analytics or third-party scripts on invitation pages | `links/assets/personal.js:55-60`; `links/assets/personal-flow.mjs:380`; `links/generate.mjs:106` |
| Old profile photos stay in storage until cleanup is enabled; notification outbox rows are kept | `mobile/app/data-privacy.tsx:97-101`; `qa/chat-release/README.md:1007` |
| Sample "wellness" figures are shown and labelled fictional | `mobile/app/data-privacy.tsx:127-137` |
| No DPIA, LIA, records of processing, Online Safety risk assessment, breach runbook or ICO fee record in `docs/`, `knowledge-base/` (outside audit extracts) or `qa/` | grep on 17 Nov 2026 for those terms found nothing |
| The Supabase organisation and the Expo project owner carry names that differ from the company in the 2020 policy | `docs/implementation-status.md:30`; `mobile/app.json:98` |

---

## 2. What must be true before submission (short list)

In priority order. Each line points to the obligation below.

1. Name the operator (LAW-1), then publish a **privacy notice** (LAW-3, LAW-4) and **Terms of use** (LAW-29, LAW-39) at stable URLs, linked in the app and in App Store Connect (LAW-45).
2. **Switch off phone-code test mode** and connect a real SMS route (LAW-16). Today anyone can sign in to any phone account.
3. Put the **account-deletion lifecycle live** on the hosted project, for phone-only accounts too (LAW-13, LAW-46).
4. Set the **support address** and a complaints route (LAW-12, LAW-31, LAW-47). Name the backup moderator (LAW-28).
5. Write the **Online Safety Act** records: illegal content risk assessment and children's access assessment (LAW-27, LAW-32, LAW-35). Add a CSEA escalation route (LAW-36).
6. Write the **DPIA**, **LIAs** and **records of processing** (LAW-6, LAW-7, LAW-8). Fix retention gaps (LAW-14).
7. Pay the **data protection fee** if not paid (LAW-18). Check processor contracts and transfers (LAW-9, LAW-10).
8. Add the **E-Commerce and Companies Act** details to the app and the link site (LAW-40, LAW-42).
9. Decide whether to list in EU storefronts. If yes: EU representative, DSA contacts and legal representative, Apple trader status (LAW-51 to LAW-60).

---

## 3. Who the operator is

### LAW-1 · Confirm and name the controller and service provider — `legal-must`
- **Requires.** Every notice and the Terms must name the legal person who decides why and how data is used (UK GDPR Art 13(1)(a), 14(1)(a) [6]). The same entity is the "provider" under the Online Safety Act and the "service provider" under the E-Commerce Regulations [24][42]. Vendor contracts (Supabase, Vercel, Expo, Apple Developer) should be held by that entity, because their DPAs bind the account holder [10][11].
- **When.** Before publishing any notice.
- **Now.** The 2020 website policy names a UK limited company (`S0913--website-privacy-policy.txt:1`). The Supabase organisation has another name (`docs/implementation-status.md:30`). The Expo owner in `mobile/app.json:98` is a personal account. The owner must confirm which entity operates the app, that it is active at Companies House, and move or confirm vendor accounts.
- **Source.** [6] [10] [11] [42]

---

## 4. UK GDPR and the Data Protection Act 2018, as amended by the Data (Use and Access) Act 2025

### What the Data (Use and Access) Act 2025 (DUAA) changed, and when
- **5 February 2026:** most Part 5 data protection and PECR changes came into force under the Commencement No. 6 Regulations (S.I. 2026/82) [1][2]. These include recognised legitimate interests (new Art 6(1)(ea) and Annex 1) [2][7], new response time rules for rights requests (Art 12A) and "reasonable and proportionate" searches (Art 15(1A)) [2][15], the transfer "data protection test" [14], the children's higher protection matters in Art 25 [19], the PECR storage and access exceptions [20], and PECR fines up to £17.5m or 4% of worldwide turnover [4][21].
- **19 June 2026:** the duty on controllers to handle data protection complaints (new DPA 2018 s.164A, inserted by DUAA s.103) came into force. It applies to complaints received on or after that date [2][3] *(extract)*.
- **30 September 2026:** the Information Commissioner's Office was replaced by the **Information Commission** (S.I. 2026/1015). It still calls itself the ICO [1][5] *(extract)*. Notices should name "the Information Commission (ICO)".
- **Not in force yet / no date:** none relevant to this app found.

### LAW-2 · Write every document to the post-DUAA law — `should`
- **Requires.** Use the current terms: Art 12A time limits, recognised legitimate interests, the "data protection test" for transfers, the Information Commission as regulator, and the s.164A complaints route.
- **When.** Now. The 2020 website policy (`S0913--website-privacy-policy.txt:1`) cites EU GDPR and must not be reused.
- **Source.** [1] [2] [5]

### LAW-3 · Privacy notice for app users (Art 13) — `legal-must`
- **Requires.** At the time data is collected, give: who the controller is and how to contact it; the purposes and the lawful basis for each; the legitimate interests relied on; recipients (Supabase, Vercel, Expo, Apple, Google, any email or SMS provider); transfers outside the UK and the safeguard; retention periods or criteria; the rights (access, rectification, erasure, restriction, objection, portability, withdrawing consent); the right to complain to the Information Commission; whether giving data is required and what happens if not; any automated decision-making [6] *(text not re-read)*. Since 19 June 2026, also say how to complain to the operator first (s.164A) [3].
- **App-specific content the notice needs.** Phone number is required and verified; the 18+ tick and its record; optional details (date of birth, city, interests); profile and cover photos (resized, metadata removed, private storage; old uploads kept until cleanup, `data-privacy.tsx:97-101`); plans, invitations and answers; chat messages are stored on servers, readable by everyone in the chat including later joiners, and **not end-to-end encrypted** (`data-privacy.tsx:117-123`); "anyone with an event's link can join while the link is on" (`data-privacy.tsx:104`); the contact lookup on picked numbers only (`data-privacy.tsx:56-65`); push tokens; link-open counts without identity (`data-privacy.tsx:107-108`); reports kept 180 days after closing and blocks visible to the team (`safetyCopy.ts:85-91`); suspensions; backups and logs (7 days).
- **When.** Before public launch. Link it before the sign-up tick and from Data & privacy.
- **Now.** No notice exists. The tick shows "Privacy Policy" as plain words unless `EXPO_PUBLIC_PRIVACY_URL` is set (`TickRow.tsx:60-70`), and that variable is not in `mobile/.env.example`. Data & privacy has good topic text but no controller identity, lawful bases, retention periods, rights or regulator (`data-privacy.tsx:49-166`).
- **Source.** [6] [3] [45]

### LAW-4 · Privacy information for people whose numbers are used but who are not users (Art 14) — `legal-must`
- **Requires.** When data is not obtained from the person, give the Art 13 items plus the categories of data and the **source** ("a friend who uses the app picked your number from their contacts"), and the right to object. Give it within a reasonable period and at the latest within one month, or at the first communication if the data is used to contact the person (Art 14(3)) [21] (read on legislation.gov.uk on 3 Nov 2026). If giving it individually is impossible or would need disproportionate effort, Art 14(5)(b) allows other measures, including making the information public *(text not re-read)*. The ICO treats reliance on this exemption as "invisible processing", a DPIA trigger (LAW-7) [8] *(extract)*.
- **Two cases in this app.**
  1. *Lookup only* (the number is compared and not kept): `contacts_on_resbite` keeps only a daily count (`contact_invitations.sql:30-77`). A public notice section is proportionate.
  2. *Personal invitation* (the number is **stored**: `private.phone_invitations.phone`, `contact_invitations.sql:12-25`). The first communication is the host's own message, but the person then lands on the `/i/` page. Put a short notice on that page: who the operator is, that the host gave the number, why, how long it is kept, and how to object or ask for deletion.
- **When.** Before launch.
- **Now.** The `/i/` page links a privacy notice only if `PRIVACY_URL` is set (`links/server/lib/options.mjs:16-18`). There is no non-user wording and no objection route.
- **Source.** [21] [6] [8]

### LAW-5 · A lawful basis for each purpose, recorded and stated — `legal-must`
- **Requires.** Each purpose needs one Art 6 basis, decided in advance and stated in the notice (Art 5(2) accountability) [7]. Recognised legitimate interests (Annex 1) need no balancing test, but only cover listed purposes such as crime prevention, safeguarding and emergencies [7] *(extract)*.
- **Proposed bases** (for the owner and a lawyer to confirm):

| Purpose | Basis |
|---|---|
| Account, phone verification, profile, plans, invitations, answers, chat, groups, connections, service pushes | Contract, Art 6(1)(b) |
| 18+ tick record, Terms version | Legitimate interests (enforcing the age limit and terms); Art 6(1)(f) |
| Optional date of birth, city, interests | Consent, or drop them (LAW-15) |
| Contact lookup on picked numbers (users' and non-users' numbers) | Legitimate interests (helping the host invite friends) — needs an LIA |
| Keeping non-users' numbers for personal invitations | Legitimate interests — needs an LIA and a short retention |
| Reports, blocks, blocked-terms filter, suspensions, moderation | Legal obligation for the Online Safety Act duties, Art 6(1)(c); legitimate interests for the rest |
| Disclosures to police or the NCA | Recognised legitimate interest (crime prevention, safeguarding), or legal obligation for CSEA reports (LAW-36) |
| Link-open counts, security logs, abuse rate limits | Legitimate interests |
| Backups | Legitimate interests (resilience) |

- **When.** Before launch, in the records (LAW-8) and the notice (LAW-3).
- **Source.** [7] [6]

### LAW-6 · Legitimate interests assessments (LIAs) — `legal-must`
- **Requires.** For each legitimate-interests purpose, record the three-part test: purpose, necessity ("is there another less intrusive way"), and balancing against the person's interests [7][21] *(extract)*. Art 5(2) requires the operator to be able to show compliance.
- **Priority LIAs.** Non-users' numbers in the lookup and in stored invitations; moderation evidence kept after deletion (180 days); blocks visible to the team; link-open counts.
- **When.** Before launch.
- **Now.** None found.
- **Source.** [7] [21]

### LAW-7 · Data protection impact assessment (DPIA, Art 35) — `legal-must`
- **Requires.** A DPIA before processing that is likely to be high risk. The ICO's list includes **data matching** ("combining, comparing or matching personal data obtained from multiple sources"), **invisible processing** (data not from the person, where Art 14 notice is not given) and **tracking** [8] *(extract)*.
- **Why it applies.** The lookup compares a host's picked numbers with users' numbers (`contact_invitations.sql:64-77`). Non-users' numbers are stored (`contact_invitations.sql:12-25`). Chat lets people who joined by an open link message others (`data-privacy.tsx:104,117-119`). Children might get in on a self-declared tick (LAW-19). Together these make a DPIA the safe course.
- **When.** Before public launch. Update before SMS sending, any analytics, or any wider sharing.
- **Now.** None found.
- **Source.** [8]

### LAW-8 · Records of processing activities (Art 30) — `legal-must`
- **Requires.** Organisations with fewer than 250 staff are exempt **only** for processing that is occasional, unlikely to be a risk, and not special-category or criminal data. This app's processing is continuous, so the exemption does not apply. The record lists the controller, purposes, categories of people and data, recipients, transfers, retention and security measures, and must be shown to the regulator on request [9] *(extract)*.
- **When.** Before launch; keep it current.
- **Now.** None found.
- **Source.** [9]

### LAW-9 · Contracts with processors (Art 28) — `legal-must`
- **Requires.** A written contract with each processor with the Art 28(3) terms *(text not re-read)*.
- **Per vendor.**
  - **Supabase** (database, Auth, Storage, Edge Functions, Realtime): its DPA forms part of the terms and takes effect with them. The importer is Supabase Pte. Ltd (Singapore). Sub-processors at a published list with 30 days' notice. "Version 1 — August 1, 2026" [10]. Covered once the account holder is the operator (LAW-1).
  - **Vercel** (link site): its DPA becomes binding on entering the agreement; "Last Updated March 17, 2026"; sub-processors at security.vercel.com [11]. **UNVERIFIED** whether it covers the plan in use; the owner should check the plan and the DPA's scope.
  - **Expo** (EAS builds, push service): Expo says it is a processor for end-user data; it stores push tokens and deletes push payloads after handing them to Apple or Google [12]. **No DPA found** on its public pages (UNVERIFIED). The owner should ask Expo for its DPA or confirm the terms that carry Art 28 clauses.
  - **Email sender** for Auth emails (Supabase's own or a custom SMTP): not in the repo; owner to confirm. **Future SMS provider**: needs a DPA before switching on (LAW-16, LAW-25).
  - **Apple** (Sign in with Apple, APNs, TestFlight) and **Google** (sign-in): most likely independent controllers for their own account data, not processors (inference, **UNVERIFIED**). Name them as recipients and sources in the notice.
- **When.** Before launch.
- **Source.** [10] [11] [12]

### LAW-10 · International transfers (UK GDPR Chapter V) — `legal-must`
- **Requires.** A transfer outside the UK needs adequacy regulations or an appropriate safeguard. The IDTA or the UK Addendum to the EU SCCs are the standard safeguards; with them, a documented "data protection test" (formerly a transfer risk assessment) that protection is "not materially lower". The ICO plans to update the IDTA and Addendum during 2026; keep using the current versions [14] *(extract)*. The **UK-US data bridge** (in force 12 October 2023) covers US recipients that take part in the UK Extension to the EU-US Data Privacy Framework [13].
- **Per vendor.** Supabase data sits in London, but the processor is a Singapore company with remote access; its DPA incorporates the UK Addendum [10]. Vercel's DPA incorporates the EU SCCs with a UK addendum [11]. Expo relies on the Data Privacy Framework including the UK Extension [12]; check Expo's active listing on the DPF list (not done here).
- **When.** Before launch. Record the safeguard and the data protection test per vendor in the records (LAW-8).
- **Source.** [13] [14] [10] [11] [12]

### LAW-11 · Handling data subject rights — `legal-must`
- **Requires.** Respond within **one month** of the "relevant time" (receipt, or receipt of ID or a fee if asked). Extend by two months for complex or numerous requests, with notice and reasons inside the first month. The clock pauses while the operator asks for clarification it reasonably needs. Access searches need only be "reasonable and proportionate" (Art 12A and 15(1A), from 5 Feb 2026) [15] *(extract)*. Rights include access, rectification, erasure, restriction, objection and portability *(text not re-read)*.
- **What to build.** A published contact route (LAW-12); a short internal procedure with ID checks proportionate to a phone-number account; an export method for access and portability (the SQL editor is fine at this scale); in-app deletion (LAW-13); rectification via Profile (already exists, `data-privacy.tsx:88`).
- **When.** Before launch.
- **Source.** [15]

### LAW-12 · The controller complaints duty (DPA 2018 s.164A) — `legal-must`
- **Requires.** Since **19 June 2026**, every controller must: facilitate complaints, for example with a complaint form that can be completed electronically and by other means; **acknowledge within 30 days**; take appropriate steps without undue delay, including enquiries and progress updates; and tell the complainant the outcome [3] *(extract)*. The ICO published "How to deal with data protection complaints" on 12 February 2026 (secondary source; **UNVERIFIED**).
- **When.** Already in force.
- **Now.** No support address is set (`mobile/.env.example:11-14`; `qa/chat-release/README.md:864`), so there is no route at all.
- **Source.** [3] [2]

### LAW-13 · Erasure: put the deletion lifecycle live — `legal-must`
- **Requires.** The right to erasure (Art 17) applies when data is no longer needed, consent is withdrawn, or the person objects to legitimate-interests processing without overriding grounds *(text not re-read)*. In practice the operator must be able to delete an account and its data on request. Apple separately requires in-app deletion (LAW-46).
- **When.** Before launch.
- **Now.** Not live: the migrations are local only, the build switch is off, and the screen says deletion "is not enabled in this development build" (see Facts). OB-D5: the functions still require a roster row or grant and a confirmed email (`08-decisions.md:776`). A phone-only account has no confirmed email, so it could never delete itself even after release. The deletion release must remove both conditions.
- **Source.** [6] [45]

### LAW-14 · Storage limitation: a retention schedule that the system enforces — `legal-must`
- **Requires.** Keep personal data no longer than needed (Art 5(1)(e)) *(text not re-read)*; state periods or criteria in the notice (LAW-3).
- **Gaps found.**
  - Non-users' numbers in `private.phone_invitations` live as long as the plan (`contact_invitations.sql:14-15`). Proposed: delete the number when the invitation is answered, revoked, or the event ends plus a short period.
  - Chat messages: no deletion except account deletion, which is not live (`data-privacy.tsx:120-123`). Proposed: a period after the chat closes (one-offs close 48 hours after the end, `docs/implementation-status.md:15`).
  - Notification outbox rows are kept; chat writes one per recipient per message (`qa/chat-release/README.md:1007`).
  - Old profile photos stay until cleanup is enabled (`data-privacy.tsx:97-101`); the cleanup migration is local only.
  - Test-code tables and logs (`phone_accounts.sql:31-41`) should be emptied when test mode ends.
  - Already defined: reports deleted 180 days after closing (`qa/chat-release/README.md:123`); backups and logs 7 days (`qa/b0-retention-proposal.md:22-24`).
- **When.** Before launch for the schedule; jobs as soon as possible after.
- **Source.** [6] [9]

### LAW-15 · Minimise the optional details — `should`
- **Requires.** Collect only what each purpose needs (Art 5(1)(c)) *(text not re-read)*.
- **Now.** Date of birth, city, interests and an unverified phone field are optional extras (`data-privacy.tsx:84-88`). Date of birth accepts any date up to today (`registration.ts:35-45`). A stored under-18 date gives the operator actual knowledge of a child user (LAW-19, LAW-32). Either drop the field or refuse dates under 18 and act on them.
- **Source.** [6] [18]

### LAW-16 · Security of processing: end phone-code test mode — `legal-must`
- **Requires.** Appropriate security against unauthorised access (Art 5(1)(f) and Art 32) *(text not re-read)*. A personal data breach includes unauthorised access to accounts (LAW-17).
- **Now.** In test mode, `public.exchange_test_code` returns the real one-time code for any number whose code was requested in the last 10 minutes when given `000000`, and anonymous callers may call it (`phone_accounts.sql:77-98`; `phone_key.sql:61`). So **anyone who knows a user's phone number can sign in as that user** and read their chats and plans. The owner accepted this risk for testing (CI-D13, `08-decisions.md:391`). It is not acceptable for a public release.
- **When.** Before public launch. Turn test mode off (`private.phone_mode`, `phone_accounts.sql:11-15`), connect a real SMS route through the Send SMS hook (LAW-25), and give App Review a dedicated review number.
- **Source.** [6] [16]

### LAW-17 · Breach procedure — `legal-must`
- **Requires.** Report a personal data breach to the Information Commission **within 72 hours** of becoming aware of it, unless it is unlikely to result in a risk to people. Tell affected people without undue delay if the risk is high. Give information in phases if needed, with reasons for delay. Keep a log of every breach, including the reasons for not reporting [16] *(extract)*.
- **When.** Before launch: a one-page runbook with who decides, how to contain, the report link, and the log.
- **Now.** None found.
- **Source.** [16]

### LAW-18 · Data protection fee — `legal-must`
- **Requires.** Organisations that process personal data must pay an annual fee unless exempt; failing to pay can lead to a fine [17]. Tiers: **£52** (tier 1, micro: turnover up to £632,000 **or** no more than 10 staff), **£78** (tier 2), **£3,763** (tier 3); £5 off by Direct Debit [17] *(extract for criteria)*. None of the exemptions (for example staff administration or own-goods advertising only) fits an app that processes users' data (inference).
- **When.** Before processing; it should already be paid for the beta.
- **Now.** No record in the repo. Owner to confirm the registration.
- **Source.** [17]

### LAW-19 · Children's code and "children's higher protection matters" (Art 25(1A)–(1B)) — `legal-must`
- **Requires.** The Children's code (statutory code under DPA 2018 s.123) covers online services **likely to be accessed by children** (under 18). Adult-only services are in scope if children are likely to access them; the ICO reads "likely" as "more probable than not", judged on the service's nature, appeal to children and access controls. Restricting access effectively, so children are not a significant number of users, takes the service out of scope [18] *(extract)*. Under standard 3, either establish age with certainty appropriate to the risk or apply the code to all users [18]. Since 5 Feb 2026, Art 25(1A)–(1B) requires providers of such services to weigh the children's higher protection matters when choosing measures; the ICO says conforming to the code is likely to satisfy this [19] *(extract)*. Self-declaration alone is a weak signal; the joint ICO–Ofcom statement on age assurance points the same way [33][53] *(extract)*.
- **What to do.** Record a "likely to be accessed" assessment. Evidence for "not likely": adult positioning, no child-appealing content, App Store age rating 18+ (LAW-49), the 18+ tick, phone verification, no public discovery. Evidence against: open event links let anyone with the link join (`data-privacy.tsx:104`); the tick is self-declared; date of birth can show an under-18 user (`registration.ts:35-45`). Add a route to act on reports of under-18 users.
- **When.** Before launch, alongside the Online Safety children's access assessment (LAW-32), which uses a stricter test.
- **Source.** [18] [19] [33] [53]

### LAW-20 · Record why no DPO is appointed — `nice`
- **Requires.** A DPO is mandatory only for public authorities or core activities of large-scale monitoring or special-category data (Art 37) *(text not re-read)*. Not met here. A one-line note in the records helps.
- **Source.** [6]

---

## 5. PECR (Privacy and Electronic Communications Regulations 2003)

### LAW-21 · Storage and access on the phone (reg 6 and Schedule A1) — `legal-must`
- **Requires.** Storing or reading information on a user's device needs consent unless an exception applies. DUAA s.112 rewrote reg 6 and added Schedule A1 with **five exceptions** (from 5 Feb 2026), including strictly necessary for a service the user asked for, statistical purposes, and appearance/preferences. The statistical and appearance exceptions require clear information and an easy way to object. Advertising purposes never qualify [20] *(extract)*.
- **Now.** Session storage, push-token registration, and reading contacts or location when the user chooses are strictly necessary for features the user asked for (`mobile/app.json:47-79`; `useContactInvites.ts:39-40`). There is no analytics or ad SDK (`mobile/package.json:14-42`). Keep it so. Describe this in the notice. Any future analytics must meet the statistical exception's conditions or ask for consent.
- **Source.** [20]

### LAW-22 · Storage on the link web site — `legal-must`
- **Requires.** Same rule as LAW-21 for link.resbite.com.
- **Now.** The personal page keeps a per-invitation session in `localStorage` (`links/assets/personal.js:55-60`; `personal-flow.mjs:380`): strictly necessary. The hosting brief says no analytics, session replay or third-party scripts (`links/generate.mjs:106`). No banner is needed. Add a short "cookies and storage" paragraph to the notice. Do not switch on Vercel Analytics or similar without meeting the statistical exception or asking consent.
- **Source.** [20]

### LAW-23 · Invitations by SMS or WhatsApp — `legal-must`
- **Requires.** Unsolicited **direct marketing** by electronic mail (SMS, WhatsApp, other messaging) needs the recipient's prior consent; anyone who sends **or instigates** it is responsible. The soft opt-in cannot apply to invitees. Reg 23 bans concealed senders and requires a valid opt-out address. Since 5 Feb 2026 PECR fines reach £17.5m or 4% of worldwide turnover [21] (read on legislation.gov.uk on 3 Nov 2026) [22].
- **Now.** Low risk: the host sends from their own Messages or WhatsApp with neutral text, `"{host} invited you to {title}, {when}. Reply here: {link}"` (`mobile/src/domain/contactInvites.ts:191`). There are no rewards and no "invite all" prompt.
- **Keep it that way.** No "get the app" pitch in the text; no incentives; never send SMS or WhatsApp to non-users from the operator's side without consent [21].
- **Source.** [21] [22]

### LAW-24 · Push notifications and emails — `should`
- **Requires.** Service messages (invitations to the user, replies, chat, changes) are not marketing. A promotional push or email would need consent and an opt-out. The ICO's draft direct marketing code lists push notifications and in-app messages among channels PECR can cover [23] *(extract; draft)*. Whether a push is "electronic mail" is **UNVERIFIED**; treat promotional pushes as needing consent.
- **Now.** Pushes are event-driven service messages (`supabase/functions/_shared/notification-adapters.ts:16`). Keep marketing out of them. Auth emails are transactional.
- **Source.** [23] [21]

### LAW-25 · One-time codes once an SMS provider is connected — `should`
- **Requires.** A code the person asked for is not marketing, so regs 22–23 do not apply; UK GDPR does (notice, processor contract, transfers) [21]. Vet the supplier for Ofcom's sender-ID controls and the SIM-farm offences in force since 29 Oct 2026 [21].
- **When.** At the switch from test mode (LAW-16).
- **Source.** [21]

---

## 6. Online Safety Act 2023

### LAW-26 · Record that the app is a regulated user-to-user service — `legal-must`
- **Requires.** The Act covers services that let users post content or interact, including messaging, with links to the UK (a significant number of UK users, or the UK as a target market). Duties apply whatever the size, but are proportionate to risk and capacity [24]. Schedule 1 exempts only services whose sole user content is email, SMS/MMS, one-to-one live voice, or comments and reviews on the provider's own content [25] *(extract)*.
- **Why it applies.** Users post chat messages, announcements, names, photos and plan notes that other users see (`docs/implementation-status.md:15-19`). The UK is the target market. No exemption fits.
- **When.** Now. Penalties: up to £18m or 10% of qualifying worldwide revenue [24].
- **Source.** [24] [25]

### LAW-27 · Illegal content risk assessment (s.9) — `legal-must`
- **Requires.** A "suitable and sufficient" assessment of the risk of each kind of priority illegal content, using Ofcom's Risk Profiles, with a risk level per harm (high, medium, low, negligible) and reasons. A **new service** has three months from launch; a **significant change** (new features, new ways to interact) needs a new assessment **before** the change [26] *(extract)*. Since Ofcom's 25 June 2026 statement, "suicide and self-harm" is one combined harm and **cyberflashing** is a new separate harm; providers must update their assessments [27] *(extract)*. Ofcom is enforcing: it opened an investigation into a large provider for launching a feature without a prior assessment, and on 1 April 2026 sent record requests to 30 providers [26][39] *(extract)*.
- **When.** Do it **now, before public release.** Inference: chat, groups and open links (live 12–13 Nov 2026) and a public App Store listing are significant changes, so the assessment is due before them, not three months after.
- **Now.** None found.
- **Source.** [26] [27] [39]

### LAW-28 · Illegal content safety duties and Ofcom's Code measures (s.10) — `legal-must`
- **Requires.** Proportionate systems to reduce illegal content and remove it swiftly once aware. Following Ofcom's Codes is a safe harbour. Measures that apply to **every** user-to-user service include a content moderation function that allows **swift takedown** (ICU C2) and appropriate action on complaints about suspected illegal content (ICU D7) [28] *(extract)*. Ofcom's Q&A says a small low-risk service should at least have easy-to-find terms, a way to report illegal material, and a process to deal with reports [29] *(extract)*. Further Code amendments were in force from 2 November 2026 (crisis response) and more are due in autumn 2026 [28][38] *(extract)*. Which governance measures (such as a named accountable person) apply to small services is **UNVERIFIED**.
- **Now.** Reports push the moderators; the team reads the queue daily and promises action within 24 hours (`qa/chat-release/app-store-review-notes.md:33`). Only the owner moderates, from the SQL editor; the backup reader (R-Q4) is not named (`qa/chat-release/README.md:864`; `08-decisions.md:742,749`). Name a backup and an accountable person, and write down the takedown standard.
- **Source.** [28] [29] [38]

### LAW-29 · Terms of service content required by the Act (s.10(5)–(8)) — `legal-must`
- **Requires.** Terms must say how users are protected from illegal content; must give information about any **proactive technology** used (the kind, when it runs and how it works); must be clear and accessible; and must be applied consistently [30] *(extract)*. Proactive technology includes content identification technology; the explanatory notes give keyword matching as an example [30] *(extract)*. Terms must also describe how complaints are handled (s.21) [31] *(extract)*. Ofcom's terms of service guidance is still a consultation (closed 2 October 2026) [31].
- **Now.** No Terms document exists; `TERMS_VERSION` is `2026-10` (`guestAccount.ts:4`); the chat rules are separate (`08-decisions.md:728`). Inference: the blocked-terms filter (`qa/chat-release/README.md:869`) is keyword matching, so the Terms should describe it.
- **Source.** [30] [31]

### LAW-30 · Easy reporting of illegal content (s.20) — `legal-must`
- **Requires.** Systems that let users easily report illegal content [24][29].
- **Now.** Report exists from every surface (`qa/chat-release/app-store-review-notes.md:24-29`). Reasons are Harassment, Spam, Not appropriate, Something else (`safetyCopy.ts:14`; `chat_safety.sql:771`). **Should:** add an explicit "Illegal or dangerous" or "Child safety" reason so the riskiest reports can be triaged first.
- **Source.** [24] [29]

### LAW-31 · Complaints procedure, including appeals (s.21) — `legal-must`
- **Requires.** All user-to-user providers must run a complaints procedure that is easy to access, easy to use and transparent, covering complaints about content, about the provider's compliance, and **appeals** by users whose content was removed or who were suspended or banned; with appropriate action. Ofcom's draft guidance suggests indicative timeframes and telling the user the outcome [31][29] *(extract)*.
- **Now.** No appeal route. A suspended user is told to "contact the Resbite team" (`08-decisions.md:775`), but no address is set. One email address can serve LAW-12 and LAW-31 if the Terms explain the steps and times.
- **Source.** [31] [29]

### LAW-32 · Children's access assessment (ss.35–37) — `legal-must`
- **Requires.** Decide whether children can access the service and, if so, whether the "child user condition" is met. A provider may only conclude children cannot access it if it uses **highly effective age assurance**. **Self-declaration is not age assurance** [32][33] *(extract)*. Without it, go to stage 2: is there a significant number of child users, or is the service likely to attract them? Do not rely on self-declared ages alone for that [32] *(extract)*. A new service has three months from its first day; a service that comes into scope by a change also has three months. Repeat at least yearly and before significant changes. Keep a written record [32] *(extract)*.
- **Now.** Only the 18+ tick (`guestAccount.ts:13-15`). So stage 1 cannot conclude "not accessible". The stage 2 record should weigh: adult-only purpose, no child appeal, 18+ store rating, phone verification, invitation-led access, no public discovery; and against: open links, under-18 dates of birth accepted (`registration.ts:35-45`).
- **When.** Before public release (same reasoning as LAW-27).
- **Source.** [32] [33]

### LAW-33 · Children's risk assessment and children's safety duties (ss.11–12) — `legal-must` (only if LAW-32 finds the service likely to be accessed by children)
- **Requires.** A children's risk assessment within three months of concluding the access assessment, then the protection-of-children duties, including preventing children from encountering primary priority content [24][32] *(extract)*. In practice this could require highly effective age assurance.
- **When.** Conditional.
- **Source.** [24] [32]

### LAW-34 · Freedom of expression and privacy (s.22) — `legal-must`
- **Requires.** Have particular regard to users' freedom of expression and privacy when choosing safety measures *(text not re-read)*. Record it in the risk assessment (for example, why the blocked-terms list is narrow and why chats are readable by the team only through reports).
- **Source.** [24]

### LAW-35 · Record keeping and review (s.23) — `legal-must`
- **Requires.** Written records of the illegal content risk assessment (and any children's risk assessment), how it was done and its findings, the person responsible, and the measures taken under the Codes. Review at least every 12 months and before significant changes. Ofcom says keep records at least three years [34] *(extract)*.
- **Now.** None found. Keep them in the repo (for example `docs/compliance/`), without personal data.
- **Source.** [34]

### LAW-36 · Report child sexual exploitation and abuse content to the NCA (s.66) — `legal-must`
- **Requires.** UK providers of user-to-user services must operate systems to report detected and unreported CSEA content on the service to the National Crime Agency. Commencement No. 7 Regulations (S.I. 2026/262) brought s.66(1)–(2) into force on **7 April 2026**; one legislation.gov.uk extract shows an earlier date of 3 November 2025, and reporting regulations exist for 2025 and 2026 (S.I. 2025/368, S.I. 2026/268) [35] *(extract)*. Which date governs, and the NCA's onboarding steps, are **UNVERIFIED**.
- **Now.** No law-enforcement or CSEA route in the moderation scripts or runbook (grep found none). Add a step to the reports queue: preserve, do not forward the content, report to the NCA, suspend.
- **Source.** [35]

### LAW-37 · State the age limit in the Terms and enforce it consistently — `should`
- **Requires.** The government's explainer says services that use age limits must state in their terms how they enforce them, and enforce them consistently [24]. Whether this binds non-categorised services is **UNVERIFIED**; do it anyway.
- **Source.** [24]

### LAW-38 · Categorisation and fees: none apply now — `nice`
- **Requires.** Category 1: over 34m UK users with a recommender, or over 7m with a recommender and resharing. Category 2B: over 3m UK users with direct messaging (S.I. 2025/226, in force 27 Feb 2025) [36] *(extract)*. Fees apply only to providers with qualifying worldwide revenue of £250m or more and UK revenue of £10m or more [37] *(extract)*. Neither applies. Answer any Ofcom information request on time.
- **Source.** [36] [37]

---

## 7. Consumer, contract, company information and accessibility

### LAW-39 · Fair and transparent Terms of use (Consumer Rights Act 2015, Part 2) — `legal-must`
- **Requires.** Consumer terms must be fair and transparent; the CMA's draft revised guidance says this applies to digital content whether paid for or **free** [40] *(extract)*. Terms cannot exclude liability for death or personal injury caused by negligence (CRA s.65) *(text not re-read)*. Since 6 April 2025 the CMA enforces consumer law directly under the DMCC Act 2024, with fines up to 10% of global turnover [41]; it says unfair terms are an early target [40] *(extract)*. The CMA's final revised unfair-terms guidance replaced the 2015 version in 2026 [40] *(extract)*.
- **Content the Terms need here.** Who provides the service (LAW-1); 18+ only; acceptable use and the chat rules (`08-decisions.md:728`); what the operator may remove and when it may suspend (LAW-29); reporting, complaints and appeals (LAW-31); the blocked-terms filter (LAW-29); that the service is free and may change; liability limits that a court would find fair; governing law (England and Wales, or as advised); how changes are notified (the tick records a version, `guestAccount.ts:4`).
- **When.** Before launch.
- **Source.** [40] [41]

### LAW-40 · E-Commerce Regulations 2002, reg 6: provider details — `legal-must`
- **Requires.** Make "easily, directly and permanently accessible": the provider's name; the geographic address where it is established; contact details including an email address for quick, direct contact; the trade register and registration number; the VAT number if VAT-registered. Recipients can sue for damages for breach [42] *(extract)*.
- **Where.** An "About and legal" row in the app (Profile or Data & privacy) and a footer on link.resbite.com pages.
- **Now.** Not shown anywhere.
- **Source.** [42]

### LAW-41 · E-Commerce Regulations, reg 9: information before sign-up — `should`
- **Requires.** Before a contract is concluded online, explain the technical steps, whether the contract is filed and accessible, how to correct input errors, and the languages; and give the Terms in a form the user can store and reproduce *(text not re-read; **UNVERIFIED**)*.
- **Practical.** A web page for the Terms meets the storage point. The sign-up screens already let people go back and correct details.
- **Source.** [42]

### LAW-42 · Company details on the web site (Companies Act trading disclosures) — `legal-must`
- **Requires.** A limited company's websites must show its registered number, registered office address, where it is registered (England and Wales, Scotland or Northern Ireland), and that it is a limited company; its name must be on all company documents and publicity [43].
- **Where.** Footer of link.resbite.com and of the pages hosting the privacy notice and Terms. App Store seller name should match.
- **Source.** [43]

### LAW-43 · No misleading claims (DMCC Act 2024 unfair commercial practices) — `should`
- **Requires.** Do not mislead consumers by action or omission; the CMA enforces directly since 6 April 2025 [41].
- **Watch.** Sample wellness figures (`data-privacy.tsx:133-136`): remove from the public build or keep them clearly labelled as samples on the screen itself. The draft review notes call the app "invitation-only" (`app-store-review-notes.md:14`) while open links let anyone with the link join (`data-privacy.tsx:104`). The "act within 24 hours" promise (`app-store-review-notes.md:33`) must be true with one moderator.
- **Source.** [41]

### LAW-44 · Accessibility (Equality Act 2010) — `should`
- **Requires.** Service providers must make reasonable adjustments for disabled people, anticipating needs rather than waiting for a request. The EHRC's guidance applies this to websites; it is thinner on apps [44] *(extract)*. There is no UK accessibility statement duty for private companies (that rule is for public bodies) [44].
- **Practical.** Use WCAG 2.2 AA as the benchmark. Device VoiceOver checks are still pending (`docs/implementation-status.md:28,70`).
- **Source.** [44]

---

## 8. Apple checks that sit on these laws

These are the legal items Apple reviews at submission. A separate note may cover the rest of the guidelines.

### LAW-45 · Privacy policy link in App Store Connect and in the app (5.1.1(i)) — `submission-blocker`
- **Requires.** "All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app in an easily accessible manner." It must identify what data is collected, how, and all uses; confirm third parties give equal protection; and explain retention and deletion and how to revoke consent or request deletion [45].
- **Now.** No policy; the in-app words are not links unless the build has the URL (`TickRow.tsx:60-70`). Add a permanent "Privacy policy" row in Data & privacy too.
- **Source.** [45]

### LAW-46 · Account deletion inside the app (5.1.1(v)) — `submission-blocker`
- **Requires.** "If your app supports account creation, you must also offer account deletion within the app." [45]
- **Now.** Disabled, and not deployable to phone-only accounts as written (LAW-13).
- **Source.** [45]

### LAW-47 · User-generated content safeguards (1.2) — `submission-blocker`
- **Requires.** A filter for objectionable material; reporting with timely responses; blocking abusive users; **published contact information** [45].
- **Now.** Filter, report and block exist (Facts). The contact address is not set, so the build shows no contact line (`mobile/.env.example:11-14`). Timely response depends on one moderator.
- **Source.** [45]

### LAW-48 · Contacts rules (5.1.2(iv)–(v)) — `submission-blocker`
- **Requires.** Do not use Contacts data to build a contact database for your own use; contact people from Contacts only at the user's explicit, individual initiative; no "Select All" or default selection of all contacts [45].
- **Now.** Picked numbers only (`useContactInvites.ts:39-40`); the host sends each message. Stored non-user numbers must be used only for that invitation and deleted on schedule (LAW-14).
- **Source.** [45]

### LAW-49 · Honest age rating, including the new descriptors (2.3.6) — `submission-blocker`
- **Requires.** Answer the age rating questions honestly [45]. Apple's 2025 system added 13+, 16+ and 18+ [46] *(extract)*. From **16 November 2026** App Store Connect asks two new descriptors, **Shared Location** ("sharing of real-world location with another person or group") and **Dating and Relationships**; all apps must complete them by **12 January 2027** [46].
- **Practical.** Choose 18+ to match the age limit. Decide Shared Location honestly: the app shares chosen meeting places, not live location.
- **Source.** [45] [46]

### LAW-50 · App Privacy details match the privacy notice — `submission-blocker`
- **Requires.** The App Store privacy "nutrition label" must declare the data collected and its uses; it must agree with the notice (LAW-3) [48] *(page not read; **UNVERIFIED** wording)*.
- **Source.** [48]

---

## 9. EU/EEA — only if the app is offered there

Today's testers include people in Europe, and the App Store lists apps in all territories by default. The owner can untick EU storefronts at launch. Everything below applies only if the app is offered in the EU/EEA.

### LAW-51 · Decide EU availability at launch — `should`
- **Requires.** A decision. Listing in EU storefronts brings EU GDPR, the DSA and Apple's trader rules. Listing UK only defers them.
- **Source.** [47] [49] [50]

### LAW-52 · EU GDPR applies directly; adapt the notice — `legal-must` (if EU)
- **Requires.** A non-EU controller offering services to people in the EU is subject to the EU GDPR (Art 3(2)) [49] *(extract)*. Add EU rights wording and the right to complain to the EU supervisory authority where the person lives. No lead authority applies without an EU establishment (inference).
- **Source.** [49]

### LAW-53 · EU representative (GDPR Art 27) — `legal-must` (if EU)
- **Requires.** Appoint in writing a representative in a member state where the users are. The exemption needs processing that is occasional **and** not large-scale special category **and** unlikely to be a risk [49] *(extract)*. Continuous chat and accounts are not occasional, so the exemption fails.
- **Source.** [49]

### LAW-54 · DSA points of contact (Arts 11–12) — `legal-must` (if EU)
- **Requires.** A single point of contact for authorities and one for users, published and easy to reach; user contact must not rely only on automated tools [50] *(Commission Q&A read directly; article text not read)*.
- **Source.** [50]

### LAW-55 · DSA legal representative (Art 13) — `legal-must` (if EU)
- **Requires.** A provider with no EU establishment that offers services in the EU must designate in writing a legal representative in a member state [50] *(extract)*. I found no micro or small enterprise exemption for this article; third-party summaries agree (inference; EUR-Lex text not read). A commercial representative service can often cover both GDPR Art 27 and DSA Art 13 (**UNVERIFIED**).
- **Source.** [50]

### LAW-56 · DSA terms and conditions (Art 14) — `legal-must` (if EU)
- **Requires.** Terms must describe content moderation policies, procedures and tools (including algorithmic decision-making such as the blocked-terms filter) and the internal complaint handling, in clear language *(article text not read; **UNVERIFIED** detail)* [50].
- **Source.** [50]

### LAW-57 · DSA notice and action, statements of reasons, and serious crime notices (Arts 16–18) — `legal-must` (if EU)
- **Requires.** All hosting providers, whatever their size, need easy notice-and-action mechanisms for illegal content; every restriction of content or an account needs a clear, specific statement of reasons to the affected user [50] *(extract)*. Art 18 requires notifying authorities of information giving rise to a suspicion of a criminal offence threatening life or safety *(text not read; **UNVERIFIED**)*.
- **Now.** A removed message shows "Message removed by Resbite" (`qa/chat-release/README.md:138`); a suspended user sees one generic line (`08-decisions.md:775`). Neither gives reasons or a route to contest.
- **Source.** [50]

### LAW-58 · Record the DSA exemptions — `should` (if EU)
- **Requires.** Micro and small enterprises are exempt from annual transparency reports (Art 15) and from the extra online-platform duties in Section 3, except Art 24(3) (giving user numbers on request) [50] *(extract)*. Inference: invitation-led chats are probably not dissemination "to the public", so the app may not be an online platform at all; open links make this less clear. Record the reasoning.
- **Source.** [50]

### LAW-59 · ePrivacy Directive Art 5(3) — `legal-must` (if EU)
- **Requires.** Same storage-and-access rule as PECR, with a strictly necessary exemption, applied through each member state's law [52] *(not read; **UNVERIFIED** for national detail)*. The app and link site use only strictly necessary storage today (LAW-21, LAW-22).
- **Source.** [52]

### LAW-60 · Apple DSA trader status for EU storefronts — `submission-blocker` (if EU)
- **Requires.** Apple must verify and show trader contact details on EU product pages under DSA Arts 30–31. Organisations show their D-U-N-S address and must add a phone number and email; documents are checked. Since **17 February 2025**, apps without trader status are removed from EU storefronts [47] *(extract)*. A company running the app is very likely a trader (inference).
- **Source.** [47]

### LAW-61 · EU–UK data flows — `nice`
- **Requires.** Nothing extra. The Commission renewed the UK adequacy decisions on 19 December 2025, running to 27 December 2031, after assessing the DUAA [51] *(extract)*. Useful if an EU representative or EU processor passes data to the UK.
- **Source.** [51]

---

## 10. Worldwide release (short note)

### LAW-62 · Limit storefronts to countries assessed — `should` (if offered worldwide)
- Each country where the app targets users can apply its own privacy, consumer, online safety and age rules. Release in the UK first (and the EU if LAW-51 says so).
- Signals in the repo suggest some Argentine users: the phone key folds Argentine numbers (`supabase/migrations/20261030130000_phone_key.sql:2-3`) and the blocked terms include Spanish (`qa/chat-release/README.md:869`). Argentina has its own data protection law; not researched here (**UNVERIFIED**).
- Apple notes Brazil requires A16 for Shared Location and A18 for Dating and Relationships [46].
- US state app-store age laws and privacy laws, and Australia's minimum-age rules, were **not researched**. An 18+ app reduces but does not remove these questions.
- **Source.** [46]

---

## 11. Open questions for the owner

1. Which legal entity operates the app, and who holds the Supabase, Vercel, Expo and Apple Developer accounts? (LAW-1)
2. Is the data protection fee paid, under which entity and tier? (LAW-18)
3. Which address handles support, privacy requests, complaints and appeals? (LAW-12, LAW-31, LAW-47)
4. Who is the backup moderator and the accountable person for Online Safety duties? (LAW-28)
5. Which SMS provider replaces test mode, and when? (LAW-16, LAW-25)
6. EU storefronts at launch: yes or no? (LAW-51)
7. Keep or drop optional date of birth, city and interests? (LAW-15)
8. Retention periods for chat messages, non-users' numbers, the notification outbox and old photos. (LAW-14)
9. Which Vercel plan runs the link site, and does its DPA cover it? Does Expo offer a DPA? Which service sends Auth emails? (LAW-9)

## 12. What I could not confirm

- **Direct reads of legislation.gov.uk, ico.org.uk, ofcom.org.uk and EUR-Lex** failed today; those passages are search extracts. In particular: the s.164A wording; the five PECR exceptions' full wording; the ICO's DPIA list wording; the Ofcom Code measures that apply to small services (including a named accountable person); the DSA articles' exact text, including Art 13 having no SME exemption.
- **The CSEA reporting date** (7 April 2026 or 3 November 2025) and the NCA's onboarding steps (LAW-36).
- **Whether a push notification counts as "electronic mail"** under PECR (LAW-24).
- **Expo's DPA** and Vercel's DPA scope by plan (LAW-9); Expo's live DPF listing (LAW-10).
- **The ICO's complaints guidance** dates (12 Feb 2026, 8 May 2026) come from secondary sources (LAW-12).
- **Apple's App Privacy details page** was not read (LAW-50).
- **Whether the TestFlight beta was already "in scope"** of the Online Safety Act before chat went live is a judgement; the report takes the cautious view (LAW-27, LAW-32).
- **Non-UK, non-EU law** (Argentina, US, Australia) was not researched (LAW-62).

---

## Sources (accessed 17 November 2026 unless noted)

1. GOV.UK, Data (Use and Access) Act 2025: plans for commencement (read directly): https://www.gov.uk/guidance/data-use-and-access-act-2025-plans-for-commencement
2. The Data (Use and Access) Act 2025 (Commencement No. 6 and Transitional and Saving Provisions) Regulations 2026, S.I. 2026/82 *(extract)*: https://www.legislation.gov.uk/uksi/2026/82/made
3. Data Protection Act 2018 s.164A (inserted by DUAA s.103) *(extract)*: https://www.legislation.gov.uk/ukpga/2018/12/section/164A ; DUAA explanatory notes *(extract)*: https://www.legislation.gov.uk/ukpga/2025/18/notes/division/10/index.htm
4. ICO, Statement on the commencement of the DUAA (Feb 2026) *(extract)*: https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/02/statement-on-the-commencement-of-the-data-use-and-access-act-duaa/
5. ICO, Governance changes confirmed for 30 September 2026 *(extract)*: https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/09/ico-governance-changes-confirmed-for-30-september-2026/ ; S.I. 2026/1015 *(extract)*: https://www.legislation.gov.uk/uksi/2026/1015/made
6. UK GDPR Arts 13 and 14 *(text not re-read today)*: https://www.legislation.gov.uk/eur/2016/679/article/13 , https://www.legislation.gov.uk/eur/2016/679/article/14
7. ICO, Recognised legitimate interest *(extract)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/recognised-legitimate-interest/ ; ICO, Legitimate interests *(extract)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/legitimate-interests/
8. ICO, Examples of processing "likely to result in high risk" *(extract)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/examples-of-processing-likely-to-result-in-high-risk/
9. ICO, Who needs to document their processing activities? *(extract)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/documentation/who-needs-to-document-their-processing-activities/ ; UK GDPR Art 30 *(extract)*: https://www.legislation.gov.uk/eur/2016/679/article/30
10. Supabase, Data Processing Addendum, Version 1, 1 Aug 2026 (read directly): https://supabase.com/legal/dpa
11. Vercel, Data Processing Addendum, last updated 17 Mar 2026 (read directly): https://vercel.com/legal/dpa
12. Expo, Privacy policy, last updated 10 Nov 2026 (read directly): https://expo.dev/privacy ; Expo, Privacy explained (read directly): https://expo.dev/privacy-explained ; Expo, Subprocessors *(extract)*: https://expo.dev/privacy/subprocessors ; Expo, Security *(extract)*: https://expo.dev/security
13. GOV.UK, UK-US data bridge: supporting documents (read directly): https://www.gov.uk/government/publications/uk-us-data-bridge-supporting-documents
14. ICO, International transfers *(extract)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/ ; ICO, The UK IDTA and the Addendum *(extract)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/appropriate-safeguards/what-are-standard-data-protection-clauses-the-uk-idta-and-the-addendum/
15. ICO, A guide to subject access *(extract)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/subject-access-requests/a-guide-to-subject-access/
16. ICO, Personal data breach reporting *(extract)*: https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/ ; ICO, How well could you respond to a personal data breach? *(extract)*: https://ico.org.uk/for-organisations/advice-for-small-organisations/personal-data-breaches/how-well-could-you-respond-to-a-personal-data-breach/
17. GOV.UK, Pay the data protection fee (read directly): https://www.gov.uk/data-protection-register-notify-ico-personal-data ; ICO, Data protection fee FAQs *(extract)*: https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee/data-protection-fee-faqs/ ; GOV.UK, Data protection fee regime: government response *(extract)*: https://www.gov.uk/government/consultations/data-protection-fee-regime-proposed-changes/outcome/data-protection-fee-regime-government-response
18. ICO, Children's code: services covered *(extract)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/ ; ICO, Introduction to the Children's code *(extract)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code/
19. DUAA s.81 (Art 25(1A)–(1B)) *(extract)*: https://www.legislation.gov.uk/ukpga/2025/18/section/81 ; ICO, Data protection by design and by default *(extract)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-by-design-and-by-default/
20. DUAA s.112 *(extract)*: https://www.legislation.gov.uk/ukpga/2025/18/section/112 ; ICO, Storage and access technologies: what are the exceptions? *(extract)*: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/
21. Repo note, 3 Nov 2026, read legislation.gov.uk directly for PECR regs 2, 22, 23, Sch 1, DPA s.157, UK GDPR Arts 6 and 14, DUAA commencement orders: `research_notes/Phone messaging providers/whatsapp-telegram-and-uk-rules.md` (its sources 30–43; ICO items there are extracts)
22. PECR reg 22: https://www.legislation.gov.uk/uksi/2003/2426/regulation/22 ; reg 23: https://www.legislation.gov.uk/uksi/2003/2426/regulation/23 (read 3 Nov 2026 per [21])
23. ICO, Direct marketing code, draft for consultation *(extract; draft)*: https://ico.org.uk/media2/migrated/2616882/direct-marketing-code-draft-guidance.pdf
24. GOV.UK, Online Safety Act: explainer, updated 24 Apr 2025 (read directly): https://www.gov.uk/government/publications/online-safety-act-explainer/online-safety-act-explainer
25. Online Safety Act 2023 Sch 1 Part 1 *(extract)*: https://www.legislation.gov.uk/ukpga/2023/50/schedule/1/part/1
26. Ofcom, Risk Assessment Guidance and Risk Profiles, v2.0, 25 Jun 2026 *(extract)*: https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/updates/risk-assessment-guidance-and-risk-profiles.pdf?v=419947 ; Ofcom, investigation into a provider's pre-launch risk assessment *(extract)*: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/investigation-into-metas-compliance-with-illegal-content-risk-assessment-duties
27. Ofcom, Statement: New priority offences – serious self-harm and cyberflashing, 25 Jun 2026 *(extract)*: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/statement-new-priority-offences-serious-self-harm-and-cyberflashing
28. Ofcom, Illegal content Codes of Practice for user-to-user services *(extract)*: https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/illegal-content-codes-of-practice-for-user-to-user-services-24-feb.pdf?v=391889 ; 9 Sep 2026 version: https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/detecting-intimate-image-abuse/illegal-content-codes-of-practice-for-user-to-user-services-9sep2026.pdf?v=425251 ; Ofcom, Statement: Crisis response protocol *(extract)*: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/statement-crisis-response-protocol
29. Ofcom, Online Safety Act Explained: Q&A, updated 28 May 2025 *(extract)*: https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/other/online-safety-act-explained-qa-web.pdf?v=409647
30. Online Safety Act 2023 s.10 *(extract)*: https://www.legislation.gov.uk/ukpga/2023/50/section/10 ; explanatory notes *(extract)*: https://www.legislation.gov.uk/ukpga/2023/50/notes/division/6/index.htm
31. Ofcom, Consultation: terms of service and complaints (Volume 4), 10 Jul 2026 *(extract)*: https://www.ofcom.org.uk/siteassets/resources/documents/consultations/giving-users-more-choice-control-and-trust-in-their-online-experience/documents/volume-4-terms-of-service-complaints.pdf?v=421924 ; draft terms of service guidance *(extract)*: https://www.ofcom.org.uk/siteassets/resources/documents/consultations/giving-users-more-choice-control-and-trust-in-their-online-experience/documents/draft-terms-of-service-guidance.pdf?v=422286
32. Ofcom, Children's access assessments guidance, 24 Apr 2025 *(extract)*: https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-1-10-weeks/statement-age-assurance-and-childrens-access/childrens-access-assessments-guidance.pdf?v=395679 ; Ofcom, Children's risk assessment guidance *(extract)*: https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-1-10-weeks/statement-protecting-children-from-harms-online/main-document/childrens-risk-assessment-guidance-and-childrens-risk-profiles.pdf?v=396653
33. Ofcom, Statement: Age assurance and children's access *(extract)*: https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-1-10-weeks/statement-age-assurance-and-childrens-access/statement-age-assurance-and-childrens-access.pdf
34. Ofcom, Record-Keeping and Review Guidance *(extract)*: https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/record-keeping-and-review-guidance.pdf?v=395683 ; v3.0, 25 Jun 2026: https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/updates/record-keeping-and-review-guidance.pdf?v=420034
35. Online Safety Act 2023 (Commencement No. 7) Regulations 2026, S.I. 2026/262 *(extract)*: https://www.legislation.gov.uk/uksi/2026/262/made ; CSEA Content Reporting Regulations 2026, S.I. 2026/268 *(extract)*: https://www.legislation.gov.uk/uksi/2026/268/contents/made ; 2025 Regulations, S.I. 2025/368 *(extract)*: https://www.legislation.gov.uk/uksi/2025/368/body/made
36. Online Safety Act 2023 (Category 1, Category 2A and Category 2B Threshold Conditions) Regulations 2025, S.I. 2025/226 *(extract)*: https://www.legislation.gov.uk/uksi/2025/226/made/data.html
37. Ofcom, Online safety fees *(extract)*: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/online-safety-fees-and-penalties
38. Ofcom, Important dates for online safety compliance *(extract)*: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/important-dates-for-online-safety-compliance ; Ofcom, roadmap *(extract)*: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/roadmap-to-regulation
39. Ofcom, Enforcement programme on risk assessment and record-keeping duties *(extract)*: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/enforcement-programme-to-monitor-if-services-meet-their-illegal-content-risk-assessment-and-record-keeping-duties-under-the-online-safety-act-2023
40. CMA, draft revised guidance on unfair contract terms *(extract)*: https://assets.publishing.service.gov.uk/media/6971eb523f2908a3490404f8/draft_guidance.pdf ; GOV.UK, Refreshing our guidance on unfair contract terms *(extract)*: https://www.gov.uk/government/consultations/refreshing-our-guidance-on-unfair-contract-terms
41. GOV.UK, CMA news: new consumer protection regime comes into force, 7 Apr 2025 (read directly): https://www.gov.uk/government/news/cma-to-boost-consumer-and-business-confidence-as-new-consumer-protection-regime-comes-into-force
42. Electronic Commerce (EC Directive) Regulations 2002, reg 6 *(extract)*: https://www.legislation.gov.uk/uksi/2002/2013/regulation/6 ; reg 9 *(not read)*: https://www.legislation.gov.uk/uksi/2002/2013/regulation/9
43. GOV.UK, Running a limited company: signs, stationery and promotional material (read directly): https://www.gov.uk/running-a-limited-company/signs-stationery-and-promotional-material
44. EHRC, Code of practice for services, chapter 7 *(extract)*: https://www.equalityhumanrights.com/guidance/codes-practice/code-practice-services-public-functions-and-associations/chapter-seven ; GOV.UK, Accessibility requirements for public sector websites and apps *(extract)*: https://www.gov.uk/guidance/accessibility-requirements-for-public-sector-websites-and-apps
45. Apple, App Review Guidelines (read directly): https://developer.apple.com/app-store/review/guidelines/
46. Apple, Upcoming: new age rating content descriptors, 2 Nov 2026 (read directly): https://developer.apple.com/news/?id=yxkh08us ; Apple, Updated age ratings *(extract)*: https://developer.apple.com/news/?id=ks775ehf
47. Apple, Manage EU Digital Services Act trader requirements *(extract)*: https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/ ; Apple, Apps without trader status will be removed *(extract)*: https://developer.apple.com/news/?id=einwn76m
48. Apple, App privacy details *(not read)*: https://developer.apple.com/app-store/app-privacy-details/
49. EU GDPR Art 27 *(extract)*: https://eur-lex.europa.eu/eli/reg/2016/679/art_27/oj ; EDPB Guidelines 3/2018 on territorial scope *(extract)*: https://www.edpb.europa.eu/sites/default/files/consultation/edpb_guidelines_3_2018_territorial_scope_en.pdf
50. Regulation (EU) 2022/2065 (Digital Services Act) *(extract)*: https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng ; European Commission, DSA questions and answers (read directly): https://digital-strategy.ec.europa.eu/en/faqs/digital-services-act-questions-and-answers
51. European Commission, Adequacy decisions *(extract)*: https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en ; Daily News 19 Dec 2025 *(extract)*: https://ec.europa.eu/commission/presscorner/detail/en/mex_25_3136
52. Directive 2002/58/EC (ePrivacy) *(not read)*: https://eur-lex.europa.eu/eli/dir/2002/58/oj
53. Ofcom–ICO joint statement on age assurance *(extract)*: https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/other/ofcom-ico-joint-statement-on-age-assurance.pdf?v=414966
