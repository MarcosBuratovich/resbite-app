# Records of processing activities

| | |
|---|---|
| **Owner** | The owner, for Resbite Ltd |
| **Version** | 1.0 — draft for solicitor review (decision D-12), not yet adopted |
| **Date** | 17 November 2026 |
| **Next review** | Before the 1.0 submission, then no later than 17 November 2027, and before any significant change (F15) |
| **Purpose** | Resbite Ltd's record of processing under UK GDPR Article 30, with the lawful basis register, the Article 10 condition, the note on why no DPO is needed, and the security measures. |

This is an internal record. It holds no personal data: people appear only by role ("the owner", "the backup moderator"). It is not legal advice. A UK solicitor reviews it with the public documents before launch (decision D-12). It is written to be complete as it stands, not softened for that review.

**What it describes.** Resbite as it will be at version 1.0. That is after workstreams B, C and D of the gap analysis are built and the F operations are in place, using the owner's answers and the rulings of 17 November 2026 (AS-D1 to AS-D8 and AS-R1 to AS-R9 in `knowledge-base/08-decisions.md`) and otherwise the gap analysis' recommended default for every owner decision D-3 to D-25. Where a statement is not true yet, it carries **[needs X]**, naming the gap analysis item that makes it true. Section 15 lists them all.

**References.** "The gap analysis" is `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`. Row ids (PRV-18, SI-7 …), item ids (A1, B3, C2 …) and decision ids (D-1 … D-25) point into it. The data inventory is `research_notes/App Store readiness/audit-data-inventory.md` (cited as DI §n). Source labels in square brackets, such as [ICO-COD], are listed with their URLs in section 8 of the gap analysis; "(x)" means the page was read only through search-engine extracts. Where the code and the gap analysis disagree, this record follows the code and says so.

**Companion records.** `legitimate-interests.md` (A10), `retention-schedule.md` (A12) and `vendors.md` (A18), all in this folder. The other records in this folder are drafted alongside this one: `dpia.md` (A9), `osa-illegal-content-risk-assessment.md` (A13), `moderation-standard.md` (A15), `data-requests.md` (A16), `breach-response.md` (A17), `law-enforcement-requests.md` (A22), `appropriate-policy-document.md` (A23) and `team-access.md` (A24). Where this record and one of them differ, the more specific record governs its own subject and this record is corrected at the next review.

## Placeholders to fill

1. [[OWNER: ICO data protection fee registration number — proposed: pay tier 1 before launch and enter the number here]]
2. [[OWNER: Twilio's region and transfer safeguard, to confirm when Resbite Ltd's account accepts Twilio's Data Protection Addendum — proposed: the United States, Twilio's main processing location, under the UK–US data bridge (Twilio Inc. states it takes part in the UK Extension to the EU–US Data Privacy Framework; check the live listing), with the UK Addendum to the EU Standard Contractual Clauses in Twilio's addendum as the fallback; Twilio's Ireland region (IE1) also offers messaging]]
3. [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]]
4. [[OWNER: whether the backup moderator is an employee, an officer, an unpaid helper or a contractor — proposed: an individual under Resbite Ltd's direct authority; a contractor, or a business supplying a moderator, also needs a processor contract]]
5. [[OWNER: mailbox provider for support@resbite.com and privacy@resbite.com — proposed: a business email service under a signed data processing agreement, with data held in the UK or EU and MFA on]]
6. [[OWNER: tool that holds the moderation, request, complaint, breach and law-enforcement logs — proposed: one access-controlled spreadsheet in the mailbox provider's business workspace, under the same data processing agreement]]
7. [[OWNER: the DPA 2018 Schedule 1 condition for criminal offence data in reports, chosen with the solicitor — proposed: paragraph 12 (regulatory requirements relating to unlawful acts), with paragraph 10 (preventing or detecting unlawful acts) as the alternative, each extended to criminal offence data by paragraph 36; paragraph 18 (safeguarding) for child-safety reports; paragraph 33 (legal claims) for records under a legal hold]]
8. [[OWNER: Vercel plan for the link site, which sets how long its request logs last — proposed: Pro, which keeps request logs for 1 day and is covered by Vercel's data processing agreement]]
9. [[OWNER: domain registrar for resbite.com — proposed: record the current registrar and move the account into Resbite Ltd's name]]

---

## 1. The controller

| Item | Entry |
|---|---|
| Controller | Resbite Ltd |
| Legal form | Private limited company registered in England and Wales, company number 12450334 |
| Registered office | 86-90 Paul Street, London EC2A 4NE, United Kingdom |
| Data protection contact | privacy@resbite.com, for data protection requests and complaints |
| Support contact | support@resbite.com, for support, reports and complaints |
| Phone | None published |
| Joint controllers | None |
| UK representative | Not needed: the controller is established in the UK |
| EU representative | Not needed for 1.0, which is offered on the UK App Store storefront only (D-2). Needed if the EU is added (GDPR Art 27; A21) |
| Data protection officer | None appointed. Section 13 says why |
| Data protection fee | Placeholder 1 |
| Regulator | The Information Commission, which took over from the Information Commissioner's Office on 30 September 2026 and still uses the name ICO (ico.org.uk). Called "the ICO" below |
| Online Safety Act | Resbite Ltd is the provider of a regulated user-to-user service. The owner is the named accountable individual (D-6; A13) |
| The service | The iPhone app Resbite (`com.resbite.app`), its Supabase backend in London (`eu-west-2`), and the link site `link.resbite.com` on Vercel. Free, with no ads, no tracking and no in-app purchases. For people aged 18 or over only |
| People acting under the controller's authority (Art 29) | The owner (full access). The backup moderator, whom the owner names (AS-D6) (least access, written instructions and a confidentiality agreement, A24) **[needs C5, A24, F16]**. Placeholder 4 |
| Processors | Listed in section 9 and in `vendors.md` |

## 2. Why this record is kept

UK GDPR Art 30(5) excuses organisations with fewer than 250 staff only where processing is occasional, is unlikely to result in a risk, and includes no special category or criminal offence data. None of that holds here. Processing is continuous. Reports hold allegations of offences (section 7). Non-users' numbers and chat bring real risk (A9). So the full record is required (LAW-8; [ICO-ROPA] (x)). The ICO may ask to see it at any time (Art 30(4)).

Where processing relies on a DPA 2018 Schedule 1 condition that needs an appropriate policy document, Schedule 1 paragraph 41 asks the record to state the condition, the Art 6 basis, and whether the data is kept and erased as the policy document says (text not re-read; legislation.gov.uk refused automated reads on 17 November 2026). Section 7 holds those entries.

## 3. Processing activities and their purposes

| Id | Activity | Purposes | People | Where |
|---|---|---|---|---|
| PA-01 | Accounts and sign-in | Create the account; sign people in by phone code, password, email code, Sign in with Apple or Google; keep them signed in; block suspended accounts | App users; web-only account holders | Supabase Auth, London |
| PA-02 | Phone verification | Prove the phone number is the person's, by an SMS code **[needs C1]**. A verified number is required on every account | App users; web-only account holders; anyone who asks for a code | Supabase Auth; Twilio, through the Send SMS hook (AS-D5; region placeholder 2) |
| PA-03 | Age, Terms and chat-rules acceptance | Record that the person confirmed they are 18 or over and accepted the current Terms version **[needs B2, C8, D3, D4]**, and the chat rules version | App users; web-only account holders | Supabase, London |
| PA-04 | Profiles | Show a name and an optional photo to people who share a resbite | App users | Supabase database and Storage, London |
| PA-05 | Resbites | Plan get-togethers: create, invite, answer, guest lists, co-hosts, meeting details, notes to guests, covers, link join requests, who brought whom, weekly groups and their roll **[roll needs C4]** | Hosts; guests; people who ask to join | Supabase, London |
| PA-06 | Event link pages and web answers | Show an event's public summary to anyone with its link; let invited people answer on the web, which creates a web-only account | Link holders; web visitors; web-only account holders | Vercel (link site); Supabase |
| PA-07 | Contact lookup | Check only the numbers a host picks against users' numbers, to show who is "On Resbite" | App users who look up; the people whose numbers are checked, users and non-users | Supabase, London |
| PA-08 | Personal invitations by number | Store a non-user's number for one personal invitation and let them answer at `/i/` | Invited non-users; hosts and guests who invite | Supabase; the link site |
| PA-09 | Removal records | Stop a person a host removed, declined or revoked from being brought straight back to that series | Removed users and non-users; hosts | Supabase, London |
| PA-10 | Objection suppression list | Honour a non-user's objection across all hosts, so no host can store their number again **[needs C3, D-23]** | Non-users who object | Supabase, London |
| PA-11 | Chat | Group messages and announcements per resbite; read positions; mutes | Chat members, including later joiners and, in a weekly group, everyone on the current week, pending guests included (AS-R8) | Supabase, London; push via Expo and Apple |
| PA-12 | Connections | Connect people who met at a resbite; record requests, acceptances, removals and "Not now" refusals | App users | Supabase, London |
| PA-13 | Notifications and service emails | Push notices (with chat text in previews, disclosed, D-13); Auth emails; the deletion confirmation **[needs B3, C2]**; local reminders on the phone | App users; email account holders | Supabase; Expo (US); Apple Push Notification service; Resend (US) |
| PA-14 | Safety and moderation | Reporting, review, removal, suspension, blocks, the blocked-terms filter **[extended to other text, needs C7]**, the 48-hour intimate image takedown **[needs B7, C6, C7, A15]**, the under-18 rule **[needs A15]**, reports to the National Crime Agency (NCA) **[needs A15]** | Reporters; reported people; people named or shown in content; affected people who are not users **[web route needs D1]** | Supabase; the support inbox (placeholder 5) |
| PA-15 | Support, complaints, appeals and data requests | Answer support; handle complaints and appeals; handle access, correction, erasure, objection and portability requests within one month; data protection complaints under DPA 2018 s.164A **[needs F1, F3, F4, A5, A16, D1]** | Users; non-users; third parties with legal complaints | The inboxes (placeholder 5); the log tool (placeholder 6) |
| PA-16 | Law-enforcement and regulator requests; legal holds | Answer police, NCA and Ofcom requests lawfully; make emergency disclosures; preserve evidence under a legal hold **[needs A22, C2, C6, F17]** | Users concerned; requesting officers (work contact details only) | Supabase; the log tool |
| PA-17 | Account deletion | Delete an account and its data from inside the app, for every account type, within 30 days; by request for web-only and banned accounts, through the owner-run deletion script that runs the same lifecycle (AS-R3); web-only accounts with no resbite in 12 months deleted by a job (AS-R4); revoke Sign in with Apple tokens **[needs B3, C2, C3, C6, D8]** | Account holders | Supabase; Apple |
| PA-18 | Security and abuse prevention | Logs, rate limits, CAPTCHA **[needs B16, D10, C11]**, session records, the review of the old test-mode log **[needs C1, F5]** | Users; web visitors | Supabase; Vercel; the CAPTCHA vendor (placeholder 3) |
| PA-19 | Backups and restore | Recover from loss; replay deletions after a restore **[needs C2, F11]** | Everyone in the database | Supabase, London |
| PA-20 | Usage records | Count link opens with no identity; record each account's first and last app session, used to show "On Resbite" only for real app users | App users; link openers (anonymous) | Supabase, London |
| PA-21 | App Store distribution | Apple distributes the app and runs App Review and TestFlight. App Store Connect shows us figures and crash reports that Apple collects under its own terms (what the 1.0 account shows is UNVERIFIED; confirm after launch) | App Store users; TestFlight testers | Apple |
| PA-22 | Team administration | Give, review and remove admin access; keep the signed A24 **[needs A24, F16]** | The owner; the backup moderator | Vendor consoles; outside the repo |

No processing is used for marketing, advertising, profiling, tracking or automated decisions with legal or similarly significant effects. The blocked-terms filter refuses a message that holds a listed word, and the sender may rephrase. That is a content rule, not a decision about a person (LI-6).

## 4. Categories of people

| Category | Who they are | Activities |
|---|---|---|
| App users | Account holders aged 18 or over who use the iPhone app | All but PA-21 |
| Web-only account holders | Invited people who answered on the link site with a verified number. Folded into the app account if they later add the same number (DI §13). Deleted after 12 months with no resbite (AS-R4) **[needs C3]** | PA-01 to PA-03, PA-05, PA-06, PA-15, PA-17 |
| Invited non-users | People whose number a host or guest picked, who have no account | PA-07, PA-08, PA-09, PA-10, PA-15 |
| People whose numbers are looked up | Any person, user or not, whose number a host picks to check | PA-07 |
| Link holders and web visitors | Anyone who opens an event or personal link | PA-06, PA-18, PA-20 |
| Reporters and reported people | Users who report, and the people or messages they report | PA-14 |
| People named or shown in user content | Anyone mentioned in chat, a title or a note, or shown in a photo | PA-11, PA-14 |
| Affected people who are not users | People in the UK who are the subject of content, a member of a group it targets, or the parent or carer of a child user (OSA s.20(2)) | PA-14, PA-15 |
| People who contact us | Senders of support emails, contact-form messages **[needs D1]**, requests and complaints | PA-15 |
| Requesting officers | Police, NCA, Ofcom and other officials, by work contact details | PA-16 |
| Team members | The owner and the backup moderator | PA-22 |
| Children | The service is for adults only. A child's data is processed only if a child gets past the 18+ confirmation. A15 sets how such an account is handled **[needs A15]** | Any, by mistake |

## 5. Categories of personal data

| Activity | Personal data | Source | Notes |
|---|---|---|---|
| PA-01 | Account id; verified phone number; email address (email, Apple, which may be a private relay address, or Google); password hash (Supabase-managed); Apple user id and first-time name; Google id, email, name and picture URL (received, unused; field list UNVERIFIED); display name in Auth metadata; session records with IP address and user agent (Supabase-managed); confirmation and last sign-in times; ban state; access grant or ban record | The person; Apple; Google; Supabase | The optional date of birth, second phone, city and interests are removed from the app and their stored values erased **[needs B11, C9]** |
| PA-02 | Phone number; the six-digit code; delivery status | The person; Supabase Auth; Twilio | Test mode is off and its stored codes emptied **[needs C1]** |
| PA-03 | Time, Terms version and method of the 18+ and Terms confirmation, per version **[needs C8]**; chat rules version and time | The person | Written for every account type **[needs B2, C8]** |
| PA-04 | Display name (1–80 characters); profile photo, resized to 1024 px, re-encoded as JPEG, metadata stripped on the phone | The person | Shown to people on shared resbites |
| PA-05 | Title, description, categories; start, end, time zone, repeat; exact meeting place (free text, may be a home address); area shown before replying; meeting details (door codes, directions); note to guests; cover photo and its description; guest list with answers and times; who brought whom and their level; co-hosts; join requests; mutes; left-group records | Hosts; guests | Latitude and longitude columns exist but the app never sends them (DI §4) |
| PA-06 | Public summary: host's name, title, time, area, going count, cover. Personal page: the invited number's calling code and last two digits. What a visitor types: the 18+ and Terms tick, phone number, code, name, answer. Browser storage: a per-invitation session with tokens, the full verified number and the event start | Hosts; web visitors | No cookies; no third-party scripts (DI §13). CAPTCHA is the one exception **[needs D10]** |
| PA-07 | The numbers a host picks (plain digits, at most 50 a call, 500 a day); the answer, whether each belongs to an app user; a daily count per host | The host's phone | The numbers are compared, not stored. Contact names never leave the phone |
| PA-08 | Invited person's number and calling code; a hash of the personal code; who invited; who answered and when; a wrong-number check counter | The host or guest who invites | Stored only until the schedule ends it **[needs C3]** |
| PA-09 | Series; removed person's account id or number; time | Hosts' actions | |
| PA-10 | A keyed hash of the objecting number; the date | The person who objects | No name, no link to who invited **[needs C3]** |
| PA-11 | Messages and announcements (up to 1,000 characters), author, time; system lines naming account ids; read positions; mutes | Chat members | Stored on the server, readable by later joiners, not end-to-end encrypted |
| PA-12 | The pair; who asked; the resbite they met at; request and accept times; refusals per resbite with a "hidden" flag | App users | The person asking is never told of a refusal (PRV-21) |
| PA-13 | Expo push token, platform, time; notice queue (recipient, kind, resbite, actor, detail, message id, times); delivery ledger (token copy, state, Expo ticket id); push content: event title, the actor's display name (the first name of who brought a guest), and in chat the sender's first name (up to 30 graphemes) and message (up to 120 graphemes) (`supabase/migrations/20261111140000_chat_core.sql:754`; `supabase/functions/_shared/notification-copy.ts:1-8`); email address and code or link; service texts to the verified number for accounts with no email (suspension notices, identity checks, security warnings) **[needs C1]** | Supabase; the person's phone | The moderator push says only "A new report is waiting." |
| PA-14 | Blocks (blocker, blocked, time); reports (reporter, reported person, message, reason, details up to 500 characters, a frozen copy of the words and author, status, review note, action); suspension records; the moderator list; reports and evidence sent by email or the web form | Users; affected people; moderators | Reports hold **criminal offence data** (section 7). The new reasons "Illegal or dangerous", "Child safety" and "Intimate image shared without consent" **[need B7, C7]** |
| PA-15 | Name, email address, message and attachments; account id if given; identity check details; case notes and outcome | The person; third parties | Kept outside the repo **[needs F1, F3, F4]** |
| PA-16 | The request, its legal basis, the requesting officer's work contact details, what was disclosed and when; legal hold records | Authorities; moderators | Kept outside the repo, except the hold flag in the database **[needs C6, F17, A22]** |
| PA-17 | Deletion request (request id, account id, a hash of the recovery secret, status, times); deletion reservation; photo clean-up records and retired-path hashes; Apple authorisation code, used once to revoke tokens and not stored **[needs B3, C2]** | The person; Supabase | |
| PA-18 | Supabase logs (path, account id in the token subject; whether API logs hold IP and user agent is UNVERIFIED); Auth events; Vercel request logs (path with the link code, search parameters, user agent, region); rate-limit counters; CAPTCHA signals (for Turnstile: IP address, TLS fingerprint, user agent, site key) **[needs B16, D10]** | Systems | |
| PA-19 | Everything in the database; Storage metadata, not image files | Systems | Seven daily copies; point-in-time recovery off (D-15) |
| PA-20 | Link opens (link id and time only); first and last app session per account | Systems | Link opens are not linked to a person |
| PA-21 | Aggregated App Store figures; crash reports from people who chose to share them with developers; TestFlight testers' details and feedback | Apple | UNVERIFIED in detail; Apple collects under its own terms |
| PA-22 | Team members' account emails and MFA status in vendor consoles; the signed A24; access review records (roles only in this repo) | Team members | |

## 6. Lawful basis register (A11)

Every purpose has one Art 6 basis, decided before the processing (Art 5(2)). The Privacy Policy (A1) states the same bases. "LI-n" points to the three-part test in `legitimate-interests.md`.

| Id | Purpose | Activities | Art 6 basis | Why | Assessment |
|---|---|---|---|---|---|
| LB-01 | Run the account the person signs up for: sign-up, verification, sign-in, sessions, profile | PA-01, PA-02, PA-04 | (b) contract | Needed to give the person the service they asked for. Every account needs a verified phone because friends find and invite each other by number (SI-5) | — |
| LB-02 | Record the 18+, Terms and chat-rules acceptance, per version | PA-03 | (f) legitimate interests | Shows who agreed to which version, and lets the age limit be enforced the same way for everyone (LAW-37) | LI-5 |
| LB-03 | Plan resbites, invite, answer, keep guest lists, co-hosts, covers, join requests, circles, weekly groups; show event link pages; take web answers; keep the browser session | PA-05, PA-06 | (b) contract | The core service. The public event page shows what the host chose to share by sending the link | — |
| LB-04 | Check picked numbers and show who is "On Resbite" | PA-07, PA-20 (app sessions) | (f) | The people whose numbers are checked have no contract with us | LI-1 |
| LB-05 | Keep a non-user's number for one personal invitation | PA-08 | (f) until they answer; then (b) for the web-only account they create | As LB-04 | LI-2 |
| LB-06 | Keep removal records per series | PA-09 | (f) | Respects the host's decision and protects the removed person's hosts and guests | LI-3 |
| LB-07 | Keep the objection suppression list | PA-10 | (f). The solicitor may prefer (c), as it serves the duty to honour an objection (Art 21) | Without it an objection lasts only until the next host | LI-4 |
| LB-08 | Chat, announcements, read positions, mutes | PA-11 | (b) | A feature of the service | — |
| LB-09 | Connections and their requests | PA-12 | (b) | A feature the user asks for | — |
| LB-10 | Keep "Not now" refusals and removals hidden from the asker | PA-12 | (f) | Spares the refusing person repeat requests without telling the asker | LI-10 |
| LB-11 | Service notifications: push, Auth emails, SMS codes, service texts to accounts with no email, the deletion confirmation | PA-02, PA-13 | (b) | Push is optional and never required. Nothing is sent for marketing. If marketing is ever added, it needs prior consent under PECR | — |
| LB-12 | Meet Online Safety Act duties: the reporting route, review and takedown (including the 48-hour intimate image takedown, from launch, D-21), suspensions, complaints and appeals, NCA reports, records | PA-14, PA-15 | (c) legal obligation: OSA ss.10, 20, 21, 23 and 66; s.20A once in force | The Act requires these steps. Art 10 condition in section 7 | — |
| LB-13 | Moderation beyond the legal minimum: reports kept 180 days after closing, frozen copies, suspension records, blocks visible to the team | PA-14 | (f) | Consistent decisions, appeals, repeat-abuse checks | LI-7, LI-8, LI-9 |
| LB-14 | The blocked-terms filter on messages, announcements and **[needs C7]** titles, descriptions, notes, meeting details and display names | PA-14 | (f) | Apple requires a filter (guideline 1.2); it is not a statutory duty for a service this size | LI-6 |
| LB-15 | Blocks, for the person who blocks | PA-14 | (b) | A feature the blocker asks for. For the blocked person, LI-9 | LI-9 |
| LB-16 | Answer data protection requests and complaints | PA-15 | (c): UK GDPR Arts 12–22; DPA 2018 s.164A | Required by law | — |
| LB-17 | General support and appeals | PA-15 | (b) for users; (f) for non-users; (c) where it is an OSA s.21 complaint | | LI-14 |
| LB-18 | Keep case records for 24 months after closing | PA-15, PA-16 | (f) | Shows compliance; answers follow-ups and claims | LI-14 |
| LB-19 | Comply with Ofcom information notices (OSA s.100), court orders and NCA reporting (OSA s.66) | PA-16 | (c) | Required by law | — |
| LB-20 | Voluntary disclosures to the police, emergency disclosures, safeguarding | PA-16 | (ea) recognised legitimate interest (UK GDPR Annex 1: crime; emergencies; safeguarding vulnerable individuals; requests from a public body for its public task) (text not re-read; [ICO-LI] (x)) | No balancing test is needed, but A22 records why each disclosure was necessary and kept to the minimum | `legitimate-interests.md`, section on recognised interests |
| LB-21 | Legal holds; establishing, exercising or defending legal claims | PA-16 | (f); (c) for an Ofcom preservation notice | | LI-14 |
| LB-22 | Delete accounts on request | PA-17 | (c): UK GDPR Art 17; and (b) | | — |
| LB-23 | Keep deletion receipts for 30 days after clean-up | PA-17 | (f) | Proves deletion and lets a restore replay it | LI-15 |
| LB-24 | Security, logs, rate limits, CAPTCHA | PA-18 | (f); the processing also serves the Art 32 duty | | LI-12 |
| LB-25 | Review the old test-mode log and record the outcome | PA-18 | (c): UK GDPR Art 33(5) breach documentation | | — |
| LB-26 | Backups and restore | PA-19 | (f) | | LI-13 |
| LB-27 | Link-open counts | PA-20 | (f) | | LI-11 |
| LB-28 | App Store figures and crash reports Apple shares | PA-21 | (f) | | LI-16 |
| LB-29 | Team administration | PA-22 | (b) the team member's own engagement; (f) for access reviews and MFA (security) | | LI-12 |

**Consent** is not a basis for any purpose. The optional details that would have needed it are removed (D-9) **[needs B11, C9]**. iOS permissions (Contacts, Photos, Notifications, Calendar) are device permissions, not the lawful basis. Turning push off, or refusing Contacts, still leaves the app usable (PERM-5).

**Whether data is required.** The phone number, a name and the 18+ and Terms confirmation are required to have an account. Everything else is optional or created by using the service.

## 7. Criminal offence data (Article 10)

**What counts.** The ICO treats allegations of offences as criminal offence data ([ICO-COD] (x)). Resbite holds them in:
- `private.reports`: the reason, the details (up to 500 characters), the frozen copy of the reported words and author, and the review note (`supabase/migrations/20261111160000_chat_safety.sql:763-780`). With the new reasons "Illegal or dangerous", "Child safety" and "Intimate image shared without consent", this becomes explicit **[needs B7, C7]**.
- Reports and complaints sent by email or the web form, kept in the support inbox and the log tool **[needs F1, D1]**.
- Law-enforcement requests, NCA reports and legal holds **[needs A22, F17, C6]**.

Resbite does not hold records of convictions, and does not run criminal record checks.

**Art 6 basis.** LB-12 (legal obligation) for the Online Safety Act steps; LB-13 (legitimate interests) for keeping evidence after closing; LB-19 and LB-20 for disclosures.

**Schedule 1 condition.** Art 10 allows this processing only where domestic law authorises it, which for a private company means a DPA 2018 Schedule 1 condition (s.10(5)). Which condition fits Online Safety Act moderation is UNVERIFIED and is the solicitor's call (PRV-18, D-22).

> **Condition relied on:** placeholder 7.

Candidates for the solicitor, in the order A23 proposes them. A23 (`appropriate-policy-document.md`, section 3.2) gives the full comparison. Paragraph numbers are from the DPA 2018 as enacted; the text was not re-read, because legislation.gov.uk and ico.org.uk refused automated reads on 17 November 2026. Paragraph 36 lets a Part 2 condition cover criminal offence data without its "substantial public interest" test; the rest of the condition, and the appropriate policy document, still apply.

| Candidate | Fits | Appropriate policy document |
|---|---|---|
| Sch 1 para 12, regulatory requirements relating to unlawful acts and dishonesty, read with para 36 | The Online Safety Act requires swift takedown of illegal content (s.10), which means judging whether content amounts to an offence. A23's reading: the closest fit (UNVERIFIED) | Needed |
| Sch 1 para 10, preventing or detecting unlawful acts, read with para 36 | Removing content and suspending accounts stops further offences; asking the accused for consent would defeat the purpose | Needed, except for disclosures to a competent authority (para 10(2), as the ICO's table notes for paragraphs 10 and 27) |
| Sch 1 para 18, safeguarding of children and of individuals at risk, read with para 36 | Child-safety reports and the under-18 rule | Needed |
| Sch 1 para 6, statutory purposes; para 11, protecting the public | Possible, less direct fits (A23, section 3.2) | Needed |
| Sch 1 para 33, legal claims | Records kept under a legal hold; evidence to defend a challenge | Not needed (UNVERIFIED) |
| Sch 1 para 30, vital interests | An emergency disclosure on a threat to life (A22) | Not needed (UNVERIFIED) |

**The appropriate policy document** is A23, `docs/compliance/appropriate-policy-document.md`. It is adopted before launch if the chosen condition needs it, which every Part 2 candidate does.

**Schedule 1 paragraph 41 entries** (to complete once the condition is chosen):

| Entry | Value |
|---|---|
| Condition relied on | Placeholder 7 |
| How the processing meets Art 6 | LB-12, LB-13, LB-19, LB-20 above |
| Kept and erased as the appropriate policy document says? | Yes, once A23 exists: reports 180 days after closing; case records 24 months after closing; longer only under a legal hold (`retention-schedule.md`) |

**Safeguards.** Reports sit in the private schema with row security on and no grants. Only owner-run scripts read them (`supabase/ops/open-reports.sql`). The moderator push carries no content. Only the owner and the backup moderator can read them **[backup needs C5, A24]**. Reports that name the reporter are never shown to the reported person, and an access request from a reported person never reveals the reporter's id (PRV-8, A16) **[needs A16, C6]**.

## 8. Special category data and children's data

**Special category data.** None is asked for or inferred. The Wellness tab, which showed sample health-style figures, is hidden for 1.0 (D-7) **[needs B4]**. Users may still mention health, religion, sexuality or similar in chat, titles or reports. Resbite treats that as user content: it does not use it to learn or decide anything about anyone. Whether moderating such content needs an Art 9 condition is a question for the solicitor; A23 section 6 holds the placeholder and can cover it if needed.

**Children.** The service is for adults only. Every account confirms it is 18 or over, against the current Terms version **[needs B2, C8, D3]**. The App Store age rating is overridden to 18+ (E4). The optional date of birth, which could reveal a child, is removed (D-9) **[needs B11, C9]**. A15 sets how a report that an account belongs to a child is handled: suspend, ask for no more proof than is proportionate, delete the account and its data, and record the case for A14 **[needs A15]**. A14 records whether children are likely to access the service.

## 9. Recipients

| Recipient | Type | Activities | What they receive |
|---|---|---|---|
| Other users | By design of the service | PA-04, PA-05, PA-11, PA-12 | Hosts, co-hosts and guests who have answered see the guest list with names, photos and answers; in a weekly group, everyone in its chat does too. There is no host setting for this (`private.can_see_guests`, `supabase/migrations/20261111150000_chat_groups.sql:574-580`). Chat members see messages and first names, including people who join later; in a weekly group, everyone on the current week's guest list, pending guests included, reads the whole history (AS-R8, disclosed in A1). Connections see each other |
| Anyone with an event link | By the host's choice | PA-06 | The host's name, title, time, area, going count and cover |
| Anyone who has a user's number | Side effect of PA-07 | PA-07 | That the number belongs to an app user, within 500 checks a day; blocked people excluded |
| Supabase | Processor | All in Supabase | Everything in the database, Auth, Storage, Realtime, Edge Functions, logs and backups |
| Vercel | Processor | PA-06, PA-15 (contact form), PA-18 | Visitor IP, user agent, request paths with codes, cover images passing through, contact-form messages **[form needs D1]**. Placeholder 8 |
| Expo | Processor | PA-13 | Push tokens, the device token at registration, push titles and bodies |
| Resend | Processor | PA-13 | Email addresses and the emails' content |
| Twilio | Processor | PA-02, PA-13 | Phone numbers, codes and service texts **[needs C1]**. Region: placeholder 2 |
| CAPTCHA vendor | Processor; for Turnstile, also a controller of signals it uses to improve its detection | PA-18 | Device and network signals **[needs B16, D10]**. Placeholder 3 |
| Mailbox provider | Processor | PA-14, PA-15 | Everything sent to the inboxes. Placeholder 5 |
| Log tool | Processor | PA-15, PA-16 | Case logs. Placeholder 6 |
| Apple | Independent controller (inference, UNVERIFIED, LAW-9) | PA-01, PA-13, PA-17, PA-21 | Sign in with Apple data it already holds; push device tokens and content (via Expo); token revocation at deletion **[needs C2]**; App Store and TestFlight data |
| Google | Independent controller (inference, UNVERIFIED) | PA-01 | The sign-in it performs; returns id, email, name and picture URL |
| Cloudflare (DNS) | Processor | PA-06 | DNS queries for `resbite.com`, which usually come from a resolver and rarely carry a visitor's own IP address (`vendors.md`) |
| GitHub, the domain registrar | Service providers holding no user data | — | Team account data only. The repo holds no user personal data by house rule. Placeholder 9 |
| National Crime Agency | Authority, by law | PA-14, PA-16 | Reports of child sexual exploitation and abuse content (OSA s.66) **[needs A15]** |
| Police and other law-enforcement bodies | Authority | PA-16 | The minimum needed, after the checks in A22 **[needs A22]** |
| Ofcom | Regulator | PA-16 | Information required by a notice (OSA s.100) |
| The ICO | Regulator | PA-15, PA-18 | Breach reports; responses to complaints and enquiries |
| Courts; the solicitor and other professional advisers | Independent controllers bound by confidentiality | PA-15, PA-16 | Only what a case or the advice needs |

**Not recipients.** WhatsApp (Meta) and Apple Messages carry a host's invitation, and Apple Maps and Calendar open a place or an event, only through the user's own action on their phone. Resbite sends them nothing (DI §5, §14).

Full vendor details, contracts and status: `vendors.md`.

## 10. Transfers outside the UK and their safeguards

| Vendor | Where data goes | Safeguard | Data protection test | Status |
|---|---|---|---|---|
| Supabase | Data stays in London (`eu-west-2`). The contracting entity is Supabase Pte. Ltd in Singapore, with remote access and sub-processors. Edge Functions run nearest the caller | UK Addendum to the EU Standard Contractual Clauses, in the DPA (version 1, 1 August 2026), which takes effect with the terms | Needed: record it (F7) | To confirm (F7, F8) |
| Expo | United States | UK-US data bridge: Expo states it is self-certified to the Data Privacy Framework including the UK Extension (privacy policy, 10 November 2026) | Not needed under the data bridge; check the live listing (F7) | To confirm (F7). No DPA published |
| Resend | United States (stores data there) | UK Extension to the Data Privacy Framework, and the UK Addendum to the SCCs (DPA, sections 11.1 and 6.4) | Not needed while the listing is active | To confirm (F7) |
| Vercel | US company. Functions default to Washington, D.C. (`iad1`); London (`lhr1`) is set **[needs D7]** | SCCs with the UK Addendum (DPA, last updated 17 March 2026, Schedules 3 and 5), for Pro and Enterprise customers | Needed: record it (F7) | To confirm (F7, F8). Placeholder 8 |
| Twilio (chosen, AS-D5) | Placeholder 2: proposed the United States, Twilio's main processing location; Twilio's Ireland region also offers messaging. Codes reach UK carriers | Data Privacy Framework with the UK Extension first; otherwise the UK Addendum to the SCCs (Twilio DPA, 9 April 2026, ss.2.2 and 2.5) | Only if the framework does not apply | To sign before switch-on (C1) |
| CAPTCHA vendor | US companies (Cloudflare, or Intuition Machines for hCaptcha) | Data Privacy Framework with the UK Extension; Cloudflare's DPA falls back to SCCs with the UK Addendum | Only if the framework does not apply | To choose and sign (D-3). Placeholder 3 |
| Mailbox provider; log tool | Depends on the choice | Depends on the choice | Depends | Placeholders 5, 6 |
| Cloudflare (DNS) | US company | Data Privacy Framework with the UK Extension; the Customer DPA (v6.4) falls back to SCCs with the UK Addendum | Not needed under the data bridge; check the live listing | To confirm: the DPA must be accepted for an account held by Resbite Ltd (F7, F8) |
| Apple; Google | Their own systems | Their own arrangements, as independent controllers. Resbite exports nothing to them directly, except through Expo for push | — | Role to confirm (open point) |
| EU or EEA | None for 1.0 | EU and UK adequacy runs to 27 December 2031 (LAW-61) if needed later | — | — |

## 11. Retention

The full schedule, with triggers, jobs and the legal-hold rule, is `retention-schedule.md`. In short, using the D-8 defaults:

| Data | Period |
|---|---|
| Account, profile, the 18+ and Terms record, app sessions, blocks | While the account exists (blocks until undone) |
| Account deletion | Started in the app; completed within 30 days (aiming for minutes) **[needs B3, C2]** |
| Non-users' numbers for invitations | Until answered or revoked, or 30 days after the resbite ends, whichever comes first **[needs C3]** |
| Numbers in removal records | 30 days after a one-off ends; 90 days after a series' last occurrence **[needs C3]** |
| Objection suppression list | Until the person withdraws the objection **[needs C3]** |
| Chat messages | 90 days after a one-off's chat closes; in a group, messages older than 12 months **[needs C3]** |
| Resbites, guest rows, meeting details, join requests, co-hosts, mutes | 12 months after a one-off ends, or after a series' last occurrence **[needs C3]** |
| Connections | While both accounts exist or until removed; unanswered requests 90 days **[needs C3]** |
| Connection refusals | 12 months **[needs C3]** |
| Notification outbox and delivery rows | 30 days after sending, except `invited` rows while the invitation is pending **[needs C3]** |
| Replaced profile photos and covers | 7 days unattached **[needs C3]** |
| Closed reports | 180 days after closing (decided, R-Q3) **[job needs C3; manual today]** |
| Suspension records | While suspended, then 12 months after it is lifted. If the account is deleted, the user id is cleared and the reason and dates kept for 12 months after the deletion (AS-R1) **[needs C2, C3, C6; see the code note in A12]** |
| Reports filed by a person who deletes their account | Until closed, then 180 days, with the reporter id cleared (AS-R2) **[needs C2, C3; today deleted with the account]** |
| Web-only accounts | Deleted after 12 months with no resbite; a code request never confirmed, 30 days (AS-R4) **[needs C3]** |
| Deletion receipts | 30 days after clean-up completes **[needs C2]** |
| Test-mode codes and log | Emptied at switch-off; tables dropped after the log review **[needs C1]** |
| Link opens | 12 months **[needs C3]** |
| Backups; Supabase logs | 7 days |
| Case records outside the repo | 24 months after the case closes |
| Anything under a legal hold | Until the hold is lifted **[needs C2, C3, C6]** |

## 12. How rights are handled

Requests go to privacy@resbite.com, or through "Request a copy of my data" in the app **[needs B14]**. A16 sets the procedure: proportionate identity checks for a phone account, a one-month clock from the "relevant time", extensions by up to two months for complex requests, reasonable and proportionate searches (Arts 12A and 15(1A)), and what to withhold under DPA 2018 Schedule 2 (a reporter's identity; other people's messages) **[needs A16, C6, F3]**. Erasure is self-service in the app for every account type **[needs B3, C2]**, and by request for web-only and banned accounts, through the owner-run deletion script (AS-R3) **[needs D8, A6, C6]**. Objections from non-users go on the suppression list **[needs C3]**. Data protection complaints are acknowledged within 30 days and answered with an outcome (DPA 2018 s.164A) **[needs A5, F4]**. Anyone may complain to the ICO (ico.org.uk).

## 13. Why no data protection officer is required

UK GDPR Art 37(1) requires a DPO only in three cases (text not re-read). None applies.

| Art 37(1) case | Resbite |
|---|---|
| (a) A public authority or body | No. Resbite Ltd is a private company |
| (b) Core activities that need regular and systematic monitoring of people on a large scale | No. The core activity is helping friends plan get-togethers. There is no tracking, profiling or behavioural monitoring. Moderation reacts to reports. The blocked-terms filter checks a message once when it is sent, against a short word list, and keeps nothing about the sender. The user base is small |
| (c) Core activities that consist of large-scale processing of special category data or criminal offence data | No. Criminal allegations in reports are ancillary to moderation, not a core activity, and the volume is small. No special category data is sought |

No one is called "DPO", so the Art 38–39 duties do not attach by accident. The owner handles data protection and is reached through privacy@resbite.com.

**Look again** if any of these happens: the user base grows to a large scale; proactive scanning or hash-matching of images is added; any profiling, recommendation or analytics is added; special category data is collected on purpose; the EU is added.

## 14. Security measures (Art 32)

### 14.1 Technical measures

**Hosting and data.**
- Data at rest in London (`eu-west-2`), on Supabase's Pro plan.
- Every table has row security on. Private tables have no policies and no grants; only database functions write them, each with `set search_path = ''`.
- Storage buckets are private, with 2 MB limits and fixed image types. Profile photos are served by signed links that last 300 seconds (`mobile/src/services/profile.ts:100`).
- Photos are resized and their metadata stripped on the phone before upload (`mobile/src/services/photo.ts:51-90`).
- Personal invitation codes are stored only as SHA-256 hashes. The code is made on the host's phone.
- Realtime public access is off; chat signals carry only ids (`qa/chat-release/README.md:868`; DI §6).

**Sign-in and accounts.**
- Phone codes are really sent by SMS; test mode and the `000000` swap are gone from the app, the site and the database **[needs C1, B12, D6]**.
- Leaked-password protection is on (`docs/implementation-status.md:300-302`).
- Deletion needs a fresh proof session, created in the last five minutes (`supabase/migrations/20261116120000_open_beta.sql:222-224`). Phone-code, password, email-code and Apple proofs all work **[needs B3, C2]**.
- Sign in with Apple tokens are revoked when an account is deleted **[needs B3, C2]**.

**Abuse limits.**
- Reports: 20 per account per day. Lookups and invitations: 500 numbers per host per day. Link opens: 60 a minute per link. Wrong-number checks: 10 an hour per invitation. Emails: one per address every 60 seconds.
- Vercel firewall rate limits on `/r/*` and `/i/*` **[`/i/*` needs D5]**. The SMS rate limit restored **[needs C1, F14]**.
- CAPTCHA on code requests, switched on only after the app and the site send its token **[needs B16, D10, C11]**.

**Link site.** A strict content security policy (`script-src 'self'`), `Referrer-Policy: no-referrer`, `noindex`, `nosniff`, no cookies and no third-party scripts (`links/generate.mjs:106`; DI §13). Only the CAPTCHA vendor's hosts are added to the policy **[needs D10]**.

**On the phone.** Tokens and per-account stores sit in the iOS Keychain, split into chunks (`mobile/src/services/secureChunks.ts`). Sign-out clears most stores (`mobile/src/services/sessionLifecycle.ts:22-40`).

**Secrets.** Never in the repo or in `EXPO_PUBLIC_*` variables. The Supabase secret key is a sensitive Vercel variable. Worker, SMS, CAPTCHA, Resend and Apple keys live in function secrets or vendor consoles.

**Change control.** Every hosted change needs the owner's approval of each file by name and sha256, with before-and-after snapshots, a rollback file and a `qa/` record. `supabase db push` is never used.

**Resilience.** Seven daily backups; point-in-time recovery off (D-15). A rehearsed restore into a scratch project **[needs F11]**. A restore replays deletions from receipts before the app reopens **[needs C2]**. Alerts on the push sender, the roll job and the deletion worker **[needs F10]**.

### 14.2 Organisational measures

- **Least access.** Only the owner and the backup moderator have admin access. The backup works under written instructions and a confidentiality agreement, signed before access is given (A24) **[needs A24, C5]**.
- **Known gap.** On Supabase Pro, the lowest role that can run the moderation scripts is Developer, which can read every chat, number and report (PRV-17). The DPIA records this (A9). The Team plan's read-only and project-scoped roles are the later fix.
- **No personal data in the repo, runbooks or chat.** Request, complaint, breach and law-enforcement logs live in the log tool, outside the repo (placeholder 6).
- **Procedures** in place before launch: moderation (A15), data requests (A16), breaches (A17), law-enforcement requests and legal holds (A22).
- **Processor contracts** for every vendor, and every vendor account held by Resbite Ltd **[needs F7, F8]**.
- **Training.** Each person with admin access reads A15, A16, A17 and A22 before access starts, and again after each change.

### 14.3 MFA on every admin account **[needs F16]**

MFA is required on every account below. An authenticator app or a security key is used, not SMS, where the vendor allows it. Recovery codes are kept offline by the owner.

| Account | Who has access | MFA |
|---|---|---|
| Supabase organisation and project | The owner (Owner role); the backup moderator (Developer role, PRV-17) | Required |
| Vercel team | The owner | Required |
| Expo account | The owner | Required |
| Apple Developer and App Store Connect | The owner | Required (Apple Account two-factor) |
| Google Cloud project (OAuth client) | The owner | Required |
| Resend | The owner | Required |
| Twilio console | The owner | Required |
| CAPTCHA vendor console | The owner | Required |
| Cloudflare (DNS) and the domain registrar | The owner | Required; registrar lock on |
| GitHub | The owner | Required |
| Mailbox provider: support@ and privacy@ | The owner; the backup moderator for support@ only | Required |
| Log tool | The owner; the backup moderator for the moderation log only | Required |

### 14.4 Access review every six months **[needs F16]**

Every six months, starting six months after the backup moderator first gets access, the owner:
1. Lists who holds each account above, and at which role.
2. Removes any access no longer needed, and lowers any role that is higher than the work needs.
3. Checks MFA is on for every person on every account.
4. Checks the moderator list (`private.moderators`, via `supabase/ops/moderators.sql`) matches the people on the rota.
5. Checks that the signed A24 is current for everyone with access.
6. Checks that no shared credential has been used by someone who has left.
7. Records the date and the outcome in section 16, by role only.

### 14.5 Offboarding **[needs F16]**

On the day a person's access ends:
1. Remove them from the Supabase organisation and every other console above.
2. Remove their moderator row with `supabase/ops/moderators.sql`.
3. Remove their access to the inboxes and the log tool.
4. Rotate any secret they could have seen: the Supabase secret key, worker secrets, and the SMS, CAPTCHA, Resend and Apple keys.
5. End their sessions on each service.
6. Get written confirmation that they hold no copies, as A24 requires.
7. Hand their open cases to the owner.
8. Record the date in section 16, by role only.

### 14.6 Residual risks accepted for 1.0

Each is weighed in the DPIA (A9):
- The backup moderator's role can read everything (PRV-17).
- A recycled phone number can open an old account by phone code (SI-11).
- A suspended person can return with another number (D-25).
- Chat text appears in push previews, through Expo in the US (D-13; disclosed).
- No crash reporting (D-15).
- Storage image files are not in the backups.

## 15. What must be built for this record to be true

| Item | What this record relies on |
|---|---|
| B2, C8, D3, D4 | Versioned 18+ and Terms acceptance on every account type, app and web |
| B3, C2 | In-app deletion for every account type, within 30 days; Apple token revocation; deletion receipts and their purge; the legal hold in deletion; the restore replay |
| B4 | The Wellness tab hidden |
| B7, C7 | The new report reasons; the filter extended to other text |
| B11, C9 | The optional details removed and their stored values erased |
| B12, C1, D6 | Test mode off, Twilio sending the codes (AS-D5), the swap removed, the SMS limit restored |
| B14 | "Request a copy of my data" |
| B16, D10, C11 | CAPTCHA on the app and the site, then switched on |
| C3 | Every purge job in section 11, and the suppression list |
| C4 | The weekly-group roll job |
| C5, A24 | The backup moderator, with instructions and least access |
| C6 | Suspend by account id; the removal scripts; the data export; setting and lifting legal holds; the owner-run deletion script (AS-R3) |
| D1 | The legal pages and the contact form, and the web report route for non-users |
| D5 | The `/i/*` firewall rule |
| D7 | Vercel functions in London |
| D8 | The deletion request route for web-only and banned accounts |
| F1, F3, F4, F5, F17 | The inboxes and the logs outside the repo |
| F7, F8 | Processor contracts confirmed and every account held by Resbite Ltd |
| F10, F11 | Alerts; the restore rehearsal |
| F16 | MFA, access reviews and offboarding |
| A5, A15, A16, A22, A23 | The procedures and, if needed, the appropriate policy document |

## 16. Review log

Roles only. No names.

| Date | Version | By | Change |
|---|---|---|---|
| 17 November 2026 | 1.0 draft | The owner | First record, for solicitor review |
| 17 November 2026 | 1.0 draft | The owner | The owner's answers and rulings applied (AS-D5, AS-D6, AS-R1 to AS-R5, AS-R8): Twilio; the named backup; suspension records and reports after deletion; web-only accounts; weekly-group chat history; the name Privacy Policy |

## Sources

- The gap analysis, sections 1, 2, 4 (workstream A), 5 and 7: `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`
- `research_notes/App Store readiness/audit-data-inventory.md` (DI §2–§18) and `uk-eu-law.md` (LAW-5 to LAW-10, LAW-20)
- Code checked on 17 November 2026: `supabase/migrations/20261111160000_chat_safety.sql` (reports, suspensions, blocks); `20261116120000_open_beta.sql:202-276` (what a deletion request does); `20261028120000_contact_invitations.sql` and `20261111130000_circles_of_trust.sql` (numbers); `20261110120000_connections.sql` (connections and refusals); `supabase/ops/suspend-account.sql`
- UK GDPR Arts 6, 9, 10, 30, 32, 37 and Annex 1 (text not re-read): https://www.legislation.gov.uk/eur/2016/679
- DPA 2018 Schedule 1 (text not re-read): https://www.legislation.gov.uk/ukpga/2018/12/schedule/1
- ICO, criminal offence data, conditions for processing (search extract only; the site refused automated reads): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/criminal-offence-data/what-are-the-conditions-for-processing/
- ICO, documentation duty (x): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/documentation/who-needs-to-document-their-processing-activities/
- ICO, recognised legitimate interest (x): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/recognised-legitimate-interest/
- Vendor terms read on 17 November 2026: see `vendors.md`
