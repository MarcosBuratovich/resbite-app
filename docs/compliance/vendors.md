# Vendor register

| | |
|---|---|
| **Owner** | The owner, for Resbite Ltd |
| **Version** | 1.0 — draft for solicitor review (decision D-12), not yet adopted |
| **Date** | 17 November 2026 |
| **Next review** | Before the 1.0 submission, then every six months with the access review, and before any new vendor or change of plan (F15, F16) |
| **Purpose** | Every processor and independent controller Resbite Ltd uses: its role, the personal data it gets, where, the contract and where it is, the transfer safeguard, and what is still to confirm. |

This is an internal record (A18). It holds no personal data: no account names, emails or ids. It is not legal advice. A UK solicitor reviews it before launch (decision D-12).

**What it describes.** Resbite as it will be at version 1.0, after workstreams B, C and D of the gap analysis are built, using the recommended default for every owner decision D-3 to D-25. "The gap analysis" is `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`. Vendor terms were read on the vendors' own pages on 17 November 2026; each is listed under Sources. Where a page did not answer a question, this register says so instead of guessing.

## Placeholders to fill

1. [[OWNER: SMS provider — proposed: Twilio]]
2. [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]]
3. [[OWNER: mailbox provider for support@resbite.com and privacy@resbite.com — proposed: a business email service under a signed data processing agreement, with data held in the UK or EU and MFA on]]
4. [[OWNER: tool that holds the moderation, request, complaint, breach and law-enforcement logs — proposed: one access-controlled spreadsheet in the mailbox provider's business workspace, under the same data processing agreement]]
5. [[OWNER: domain registrar for resbite.com — proposed: record the current registrar and move the account into Resbite Ltd's name]]
6. [[OWNER: Vercel plan for the link site, which sets how long its request logs last — proposed: Pro, which keeps request logs for 1 day and is covered by Vercel's data processing agreement]]
7. [[OWNER: whether the backup moderator is an employee, an officer, an unpaid helper or a contractor — proposed: an individual under Resbite Ltd's direct authority; a contractor, or a business supplying a moderator, also needs a processor contract]]

## How to read this register

**Roles.**
- **Processor:** acts only on Resbite Ltd's instructions, under a written contract with the UK GDPR Art 28(3) terms (a DPA).
- **Independent controller:** decides for itself how it uses the data, under its own privacy terms. No Art 28 contract is needed, but it is named in the privacy notice (A1) as a recipient or a source.
- **No user data:** a service the team uses that holds no app user's personal data.

**Transfer safeguards** (UK GDPR Chapter V).
- **UK-US data bridge:** transfers to a US company certified to the UK Extension of the EU-US Data Privacy Framework rely on UK adequacy regulations (in force since 12 October 2023). No data protection test is needed, but the live listing must be checked.
- **SCCs with the UK Addendum** (or the IDTA) are appropriate safeguards. With them, a documented **data protection test** (formerly a transfer risk assessment) must show protection is "not materially lower" (LAW-10).

**Status** (F7).
- **Confirmed:** the contract binds Resbite Ltd, and every check below is done.
- **To confirm:** the vendor's terms are found, but something is left: usually that the account is held by Resbite Ltd (F8), the plan, or a listing.
- **To choose:** the vendor is not chosen yet.

No vendor is **Confirmed** today, because no vendor account is yet recorded as held by Resbite Ltd (PRV-6; DOC-1).

## Summary

| Vendor | Role | Personal data | Where | DPA | Transfer safeguard | Status |
|---|---|---|---|---|---|---|
| Supabase | Processor | Everything in the database, Auth, Storage, Realtime, Edge Functions, logs, backups | London (`eu-west-2`); contracting entity in Singapore | Yes: part of the terms (v1, 1 August 2026) | SCCs with the UK Addendum | To confirm |
| Vercel | Processor | Link-site visitors' IP, user agent, paths with codes; covers passing through; contact-form messages | US company; functions in London **[needs D7]** | Yes, for Pro and Enterprise (17 March 2026) | SCCs with the UK Addendum | To confirm |
| Expo | Processor (push); no user data (builds) | Push tokens, device tokens, push titles and bodies including chat text | United States | None published | UK-US data bridge (Expo states it is certified) | To confirm |
| Apple | Independent controller (inference, UNVERIFIED) | Sign in with Apple data; push device tokens and content; App Store and TestFlight data | Apple's systems | Not applicable as a controller; the Apple Developer Program License Agreement governs | Apple's own | Role to confirm |
| Google | Independent controller (inference, UNVERIFIED) | Google sign-in: id, email, name, picture URL | Google's systems | Not applicable as a controller | Google's own | Role to confirm |
| Resend | Processor | Email addresses and Auth emails | United States | Yes: part of the terms (31 December 2025) | UK-US data bridge; SCCs with the UK Addendum as fallback | To confirm |
| SMS provider (placeholder 1) | Processor | Phone numbers, codes, delivery status | Proposed Twilio: US company | Proposed Twilio: part of the agreement (9 April 2026) | UK-US data bridge first; SCCs with the UK Addendum otherwise | To choose; sign before switch-on **[needs C1]** |
| CAPTCHA vendor (placeholder 2) | Processor; also a controller of signals for its own detection (Turnstile) | IP, TLS fingerprint, user agent (Turnstile); device and interaction data (hCaptcha) | US companies | Cloudflare: must be accepted (v6.4); hCaptcha: part of its terms, not public | UK-US data bridge | To choose **[needs B16, D10]** |
| Mailbox provider (placeholder 3) | Processor | Everything sent to the support and privacy inboxes | To record | To obtain | To record | To choose **[needs F1]** |
| Log tool (placeholder 4) | Processor | Case logs | To record | To obtain | To record | To choose **[needs F3, F4, F5, F17]** |
| GitHub | No user data | Team account data; the repo holds no user personal data | US company | Applies under an executed agreement | UK-US data bridge or SCCs | To confirm |
| Domain registrar (placeholder 5) | Independent controller of registrant data | The company's registrant details | To record | Not applicable | To record | To choose |
| Cloudflare (DNS) | Processor | DNS queries (resolver addresses, rarely an end user's) | US company | Must be accepted (v6.4) | UK-US data bridge | To confirm |

---

## Supabase

| Item | Entry |
|---|---|
| Used for | The whole backend: Postgres database, Auth (phone, email, Apple and Google sign-in), Storage (profile photos, covers), Realtime, Edge Functions (push sender, deletion, clean-up, the web account fold), logs and backups |
| Role | Processor |
| Personal data | Everything in `records-of-processing.md` sections 3 and 5 that sits in Supabase |
| People | App users, web-only account holders, invited non-users, reporters and reported people |
| Region | Data at rest in London (`eu-west-2`) (`docs/implementation-status.md:30`). Edge Functions run nearest the caller, so a call from outside the UK may run elsewhere; scheduled calls start in London (DI §14) |
| Plan | Pro: seven daily backups, point-in-time recovery off, logs kept 7 days (`qa/b0-retention-proposal.md:21-24`) |
| Contracting entity | Supabase Pte. Ltd, Singapore |
| DPA | Data Processing Addendum, version 1, 1 August 2026, https://supabase.com/legal/dpa. It forms part of the terms and takes effect with them; no separate signature. Accepting the agreement has the effect of signing the SCCs and the UK Addendum |
| Sub-processors | https://supabase.com/legal/customer-resources/subprocessor-list (latest list dated 12 October 2026, published as a PDF). At least 30 days' notice to subscribers; objections within 5 days of notice |
| Breach notice to us | Without undue delay, and where feasible within 48 hours |
| End of contract | A copy on request within 30 days, then deletion of all copies, including sub-processors' |
| Transfer safeguard | The UK Addendum (version B.1.0) to the EU SCCs, for remote access from Singapore and by sub-processors |
| Data protection test | Needed. Record it: Singapore remote access, the sub-processor list, the security certifications Supabase offers (F7) |
| Account holder today | An organisation under another company's name (`docs/implementation-status.md:30`). The DPA binds the account holder, so it does not yet bind Resbite Ltd (LAW-1) |
| Access and MFA | The owner (Owner role); the backup moderator (Developer role, which can read all content on Pro, PRV-17) **[needs C5, F16]** |
| Status | **To confirm.** Move the organisation to Resbite Ltd (F8). Record the data protection test (F7). Keep a dated copy of the DPA with this register |

## Vercel

| Item | Entry |
|---|---|
| Used for | Hosting `link.resbite.com` (project `resbite-link`): event and invitation pages, the image route, the legal pages and the contact form **[needs D1]** |
| Role | Processor |
| Personal data | Visitors' IP addresses (used for matching), user agents, request paths (which hold the link code), search parameters; cover images streamed through the image route; contact-form messages, passed to the support inbox and not stored by the site **[needs D1]** |
| People | Link holders, web visitors, web-only account holders, people who use the contact form |
| Region | Functions default to Washington, D.C. (`iad1`); the generated config sets no region (`links/generate.mjs:72-103`). London (`lhr1`) is set **[needs D7]**. Vercel's edge network serves visitors from a nearby region |
| Logs | Runtime logs: 1 hour (Hobby), 1 day (Pro), 3 days (Enterprise), 30 days with Observability Plus |
| Plan | Placeholder 6. The plan is not recorded (DI-11) |
| Contracting entity | Vercel Inc., United States |
| DPA | Data Processing Addendum, last updated 17 March 2026, effective 31 March 2026, https://vercel.com/legal/dpa. It applies "for Customers who are on Enterprise and Pro plans"; Hobby is not covered. It binds on entering the agreement |
| Sub-processors | Listed with functions and locations at security.vercel.com. Notice of new ones only on request to Vercel (see the DPA); objections within 5 calendar days |
| Breach notice to us | Without undue delay after a confirmed incident; no fixed hours |
| Transfer safeguard | The 2021 EU SCCs with the UK international data transfer addendum, deemed entered into (DPA Schedules 3 and 5). The DPA does not mention the Data Privacy Framework |
| Data protection test | Needed. Record it (F7) |
| Account holder today | A team under another company's name (`docs/implementation-status.md:491`) |
| Access and MFA | The owner **[needs F16]** |
| Status | **To confirm.** Confirm the plan is Pro or above (placeholder 6). Move the team to Resbite Ltd (F8). Set `lhr1` (D7). Record the data protection test (F7). Ask Vercel to be told of sub-processor changes |

## Expo

| Item | Entry |
|---|---|
| Used for | (1) The Expo push service (`exp.host`), which relays every push to Apple (`supabase/functions/_shared/notification-adapters.ts:16`). (2) EAS Build, which builds the app and holds the APNs key and build variables. EAS holds no app user data |
| Role | Processor for push. Expo says that once an app is distributed, "we become a data processor because we process end-user data on behalf of the developer" (Privacy explained) |
| Personal data | Expo push tokens; the APNs device token at registration; push titles and bodies: event titles, the display name of the person who acted (a first name for who brought a guest), and in chat the sender's first name (up to 30 graphemes) and the message (up to 120 graphemes) (D-13, disclosed); data ids that open the right screen |
| People | App users who allow notifications |
| Region | United States. Expo's privacy policy names no storage location |
| Retention at Expo | Push content: "never stored", handled only as long as it takes to send. Receipts: 24 hours (DI §8). Stored push tokens: period not published (UNVERIFIED) |
| DPA | None published. Expo's privacy policy (last updated 10 November 2026) and its Privacy explained page mention none. The Trust Center (expo.dev/trust) was not checked |
| Sub-processors | https://expo.dev/privacy/subprocessors |
| Transfer safeguard | UK-US data bridge. Expo states it complies with and has self-certified to the EU-US Data Privacy Framework, the UK Extension and the Swiss-US framework. Its policy also mentions SCCs and the "performance of a contract" derogation. Its line that non-US residents "consent" to transfer is not relied on |
| Data protection test | Not needed while the listing is active. Check the live listing (F7) |
| Account holder today | A personal account (`mobile/app.json:98`) |
| Access and MFA | The owner **[needs F16]** |
| Status | **To confirm.** Ask Expo for a DPA, or for written confirmation of the terms that carry the Art 28(3) clauses (F7; open question 13 in the gap analysis). Check the Data Privacy Framework listing. Move the project to an Expo organisation owned by Resbite Ltd (F8) |

## Apple

| Item | Entry |
|---|---|
| Used for | (1) Sign in with Apple. (2) Apple Push Notification service (APNs), reached through Expo. (3) The App Store, App Store Connect, App Review and TestFlight. (4) The Apple Developer account. Apple Maps and Messages are opened only by the user's own action and are not vendors |
| Role | Independent controller for its own users' account data, push delivery and App Store data (inference, UNVERIFIED; LAW-9). The solicitor should confirm, especially for APNs |
| Personal data | Sign in with Apple: Apple user id, email or private relay address, first-time name. APNs: device token, push title and body. App Store Connect: aggregated figures, crash reports from people who share them with developers, TestFlight testers' details and feedback (detail UNVERIFIED) |
| People | App users; TestFlight testers |
| Region | Apple's systems |
| Contract | The Apple Developer Program License Agreement, accepted by the developer account holder. No Art 28 contract as a controller |
| Obligations on Resbite | Revoke Sign in with Apple tokens when an account is deleted, with the REST API and a `.p8` key held as a function secret **[needs B3, C2]**. Register the email sending domain with the private relay service (SI-10, F13). Server-to-server notifications may follow 1.0 (C10). Keep the App Privacy answers true (E3) |
| Transfer safeguard | Apple's own arrangements. Resbite exports nothing to Apple directly, except push content through Expo |
| Account holder today | The membership type is not recorded (RO-08). Resbite Ltd as seller needs an organisation membership with a D-U-N-S number (F9) |
| Access and MFA | The owner, with Apple Account two-factor authentication **[needs F16]** |
| Status | **Role to confirm** (solicitor). Move to an organisation membership in Resbite Ltd's name (F9) |

## Google

| Item | Entry |
|---|---|
| Used for | "Continue with Google" through Supabase OAuth with PKCE, in an in-app browser session (`mobile/src/state/useAuthFlow.ts:234-258`). The OAuth client sits in a Google Cloud project (`qa/auth-readiness.md:23`) |
| Role | Independent controller of the person's Google account and of the sign-in it performs (inference, UNVERIFIED). The Google Cloud project holds no user data |
| Personal data | Returned to Supabase: Google id, email, name, picture URL (received, unused; field list UNVERIFIED). Scopes: `openid`, email and profile only (`qa/auth-readiness.md:24`) |
| People | Users who sign in with Google |
| Region | Google's systems |
| Contract | Google's terms for the Cloud project and the OAuth client. No Art 28 contract as a controller |
| Obligations on Resbite | Publish the Google app out of setup mode and verify the brand, so the consent screen shows Resbite, not the Supabase domain (SI-12; C11, F13). The brand check probably needs the privacy policy on the verified domain (UNVERIFIED) |
| Account holder today | The owner's Google Cloud project (`qa/auth-readiness.md:23`) |
| Access and MFA | The owner **[needs F16]** |
| Status | **Role to confirm** (solicitor). Move the project to a Google Cloud organisation or account held by Resbite Ltd (F8). Publish and verify the brand |

## Resend

| Item | Entry |
|---|---|
| Used for | SMTP for Supabase Auth: confirmation, email-code and password-reset emails, from the sending address on `resbite.com` (`qa/auth-readiness.md:74-80`). The deletion confirmation, if C2 sends it by email **[needs C2, B3]**. If D1's contact form sends through Resend, add that use here |
| Role | Processor |
| Personal data | Email addresses; codes and links; email content; delivery events |
| People | Account holders who use email |
| Region | Sends from a chosen region; stores data in the United States (`qa/auth-readiness.md`; DI §9) |
| Retention at Resend | Email and log data: 30 days on the Free, Pro and Scale plans; Enterprise is "flexible" (https://resend.com/security/gdpr, read 17 November 2026). On termination, customer data deleted within 90 days. Confirm the plan |
| DPA | Data Processing Addendum, last updated 31 December 2025, https://resend.com/legal/dpa. Binding on accepting the terms; no separate signature. The executed copy is in the Resend dashboard |
| Sub-processors | https://resend.com/legal/subprocessors. At least 14 days' notice; deemed accepted without objection within 14 days |
| Breach notice to us | Without undue delay; no fixed hours |
| Transfer safeguard | The EU-US Data Privacy Framework and its UK Extension (DPA s.11.1); the UK SCCs, that is the EU SCCs with the UK Addendum (s.6.4) |
| Data protection test | Not needed while the listing is active; needed if the SCCs are relied on |
| Account holder today | Not recorded |
| Access and MFA | The owner **[needs F16]** |
| Status | **To confirm.** Download the executed DPA, for an account held by Resbite Ltd (F7, F8). Confirm the plan, so the 30-day period in the privacy notice holds. Check the listing |

## SMS provider (placeholder 1; proposed Twilio)

| Item | Entry |
|---|---|
| Used for | Sending phone sign-in codes through the Supabase Send SMS hook, replacing test mode (SI-1) **[needs C1]**. The research recommends Twilio, with Sinch if price wins (`reports/Phone messaging providers.md:85`) |
| Role | Processor |
| Personal data | Phone numbers; the code message; delivery status |
| People | Everyone who asks for a phone code, in the app and on the link site |
| Region (Twilio) | US company; messages reach the person's carrier |
| DPA (Twilio) | Data Protection Addendum, last updated 9 April 2026, https://www.twilio.com/en-us/legal/data-protection-addendum. It forms part of the agreement; for the SCCs the customer is deemed to have signed by entering the agreement |
| Sub-processors (Twilio) | https://www.twilio.com/legal/sub-processors. 30 days' notice for infrastructure providers, 10 days for others |
| Breach notice (Twilio) | Without undue delay after discovery; no fixed hours |
| End of contract (Twilio) | Stored content deleted 30 days after termination; backups after 60 days |
| Transfer safeguard (Twilio) | In order: the Data Privacy Framework with the UK Extension; Binding Corporate Rules (described as covering EEA and Swiss transfers); the EU SCCs; the UK Addendum (version B1.0) |
| Data protection test | Not needed under the framework; needed if the SCCs are relied on |
| Settings to make | The shortest message-log period, or message-body redaction, that the provider offers; spend and rate limits against SMS pumping (OPS-5) |
| Access and MFA | The owner **[needs F16]** |
| Status | **To choose** (D-3). Sign the DPA and record it here before switching on (C1) |

## CAPTCHA vendor (placeholder 2)

Supabase Auth's CAPTCHA supports Cloudflare Turnstile and hCaptcha (OPS-9). It is switched on only after the app (B16) and the link site (D10) send its token. Before choosing: assess the script under PECR reg 6 (D10); add it to A1, the App Privacy answers (E3) and the privacy manifest (B13); and widen the link site's content security policy only for the vendor's hosts.

| Item | Cloudflare Turnstile | hCaptcha |
|---|---|---|
| Role | Processor for bot detection; controller of the signals it uses to improve Turnstile's detection, on its own legitimate interests (Turnstile privacy addendum, last updated 18 June 2025) | Processor for site owners' data ("we are the processor/service provider"); controller of its own account and analytics data (privacy policy, last updated 7 October 2025) |
| Personal data | Client IP address, TLS fingerprint, user agent, site key and origin. Cloudflare says it cannot directly identify anyone from these | IP address, browser, ISP, device and OS type, timestamps; mouse movements, scroll position, key presses and touch events; cookies |
| Retention | The addendum states none | Cookie and analytics data discarded "as soon as practical", possibly up to one year after cookie expiry, longer if abuse is detected |
| Company | Cloudflare, Inc., United States | Intuition Machines, Inc., United States |
| DPA | Cloudflare Customer DPA, version 6.4, effective 3 April 2026, https://www.cloudflare.com/cloudflare-customer-dpa/. **Not automatic:** it takes effect when the customer signs it or otherwise agrees to it. Whether it covers free plans is not stated | A Data Processing Addendum forms part of hCaptcha's Terms of Service; no public URL found |
| Transfer safeguard | Data Privacy Framework with the UK Extension; if certification lapses, the EU SCCs with the UK Addendum (DPA clauses 6.2 and 6.4) | Data Privacy Framework with the UK Extension (privacy policy). A UK Addendum in the DPA was not confirmed |
| Sub-processors | https://www.cloudflare.com/gdpr/subprocessors/; 30 days' notice | Not found |
| Status | **To choose** | **To choose** |

## Mailbox provider (placeholder 3)

| Item | Entry |
|---|---|
| Used for | The support and privacy role inboxes on `resbite.com` (D-5; F1) |
| Role | Processor |
| Personal data | Everything people send: support questions, reports and evidence from users and from affected non-users, intimate image reports, child-safety reports, data requests with identity checks, complaints, legal complaints, police requests |
| Sensitivity | High. A15 says never to ask for, keep or forward an intimate image or abuse material itself. Ask for a description and a link to where it appears |
| Region, DPA, transfer safeguard | To record when chosen |
| Retention | 24 months after a case closes, longer under a legal hold (`retention-schedule.md`, section 14) |
| Access and MFA | The owner (both inboxes); the backup moderator (support only) **[needs F16]**. Placeholder 7 |
| Status | **To choose.** Sign the DPA and record it here before the inboxes go live (F1, F7). Hold the account in Resbite Ltd's name (F8) |

## Log tool (placeholder 4)

| Item | Entry |
|---|---|
| Used for | The data request log (F3), the complaints log (F4), the breach log (F5) and the law-enforcement request log, including legal holds (F17). They are kept outside the repo because they hold personal data |
| Role | Processor |
| Personal data | Case summaries, dates, outcomes; as little as each log needs. The breach log holds no names or numbers |
| Region, DPA, transfer safeguard | To record when chosen. Using the mailbox provider's workspace keeps it under one DPA |
| Access and MFA | The owner; the backup moderator for the moderation log only **[needs F16]** |
| Status | **To choose** (F3, F4, F5, F17) |

## GitHub

| Item | Entry |
|---|---|
| Used for | Hosting this repository: code, migrations, runbooks and these records. No CI is configured |
| Role | No user data. By house rule the repo holds no user's personal data: runbooks record no names, numbers or account ids, and logs with personal data live outside the repo. GitHub holds team members' account data as an independent controller |
| DPA | GitHub Data Protection Agreement, version October 2025, https://github.com/customer-terms/github-data-protection-agreement. It attaches to "a written and executed agreement" covering a legal entity's use. Whether it covers a free personal account is not stated |
| Transfer safeguard | Data Privacy Framework with the UK Extension, and/or the SCCs with the UK Addendum (DPA s.7) |
| Account holder today | A personal account (the repository's remote) |
| Access and MFA | The owner **[needs F16]** |
| Status | **To confirm.** Move the repository to an organisation owned by Resbite Ltd (F8). Keep the no-personal-data rule |

## Domain registrar (placeholder 5)

| Item | Entry |
|---|---|
| Used for | Registering `resbite.com`, which carries the legal page URLs (`link.resbite.com`), the email sending domain, and the support and privacy inboxes |
| Role | Independent controller of the registrant's details |
| Personal data | The company's registrant contact details. No app user data |
| Security | Registrar lock on; MFA on; renewal contact a role address |
| Status | **To choose / record.** Record the registrar and move the account to Resbite Ltd (F8, F16) |

## Cloudflare (DNS)

| Item | Entry |
|---|---|
| Used for | DNS for `resbite.com`. The `link` subdomain is a DNS-only CNAME to Vercel (`docs/implementation-status.md:491`; UX3-D2 in `knowledge-base/08-decisions.md`). If Turnstile is chosen, the same vendor provides the CAPTCHA |
| Role | Processor |
| Personal data | DNS queries, which usually come from a resolver, not from the visitor. No app user data |
| DPA | Cloudflare Customer DPA, version 6.4, effective 3 April 2026. Not automatic: it must be signed or otherwise agreed |
| Transfer safeguard | Data Privacy Framework with the UK Extension; SCCs with the UK Addendum as fallback |
| Account holder today | Not recorded |
| Access and MFA | The owner **[needs F16]** |
| Status | **To confirm.** Accept the DPA for an account held by Resbite Ltd (F7, F8) |

---

## Not vendors

| Who | Why not |
|---|---|
| WhatsApp (Meta) and Apple Messages | The host sends the invitation from their own phone, by their own action (`mobile/src/services/inviteSend.ts:26-49`). Resbite sends them nothing |
| Apple Maps and Calendar | Opened by the user to show a place or add an event. Resbite sends them nothing |
| Analytics, crash reporting, advertising | None in the app or the site (`mobile/package.json:14-54`; DI-26). No crash SDK for 1.0 (D-15) |
| The National Crime Agency, the police, Ofcom, the Information Commission (ICO, ico.org.uk), courts | Recipients under the law, not vendors (`records-of-processing.md`, section 9) |
| The solicitor and other professional advisers | Independent controllers bound by professional confidentiality |
| The backup moderator | Acts under Resbite Ltd's authority (Art 29) on a signed A24. If they are a contractor, they are a processor and A24 must carry the Art 28 terms. Placeholder 7 |

## Before adding or changing a vendor

1. Decide its role. For a processor, get a DPA with the Art 28(3) terms before any personal data flows.
2. Record where the data goes and the transfer safeguard. Do a data protection test where SCCs or the IDTA are relied on. Check the live Data Privacy Framework listing where the data bridge is relied on.
3. Hold the account in Resbite Ltd's name, with MFA on (F8, F16).
4. Add it to the privacy notice (A1), the records of processing, this register and the retention schedule.
5. For anything in the app: update the App Privacy answers (E3) and the privacy manifest (B13).
6. For anything on the link site that stores or reads on the visitor's device: assess it under PECR reg 6, and widen the content security policy only for its hosts.
7. Update the DPIA (A9) if the change raises the risk.

## Review log

Roles only. No names.

| Date | Version | By | Change |
|---|---|---|---|
| 17 November 2026 | 1.0 draft | The owner | First register, from the vendors' own pages read on 17 November 2026 |

## Sources

All read on 17 November 2026 unless marked.

- Supabase, Data Processing Addendum, version 1, 1 August 2026: https://supabase.com/legal/dpa ; sub-processor list: https://supabase.com/legal/customer-resources/subprocessor-list
- Vercel, Data Processing Addendum, last updated 17 March 2026: https://vercel.com/legal/dpa ; runtime logs: https://vercel.com/docs/logs/runtime ; function regions: https://vercel.com/docs/functions/configuring-functions/region
- Expo, privacy policy, last updated 10 November 2026: https://expo.dev/privacy ; Privacy explained: https://expo.dev/privacy-explained ; sub-processors: https://expo.dev/privacy/subprocessors ; push notifications (US hosting, 24-hour receipts, per DI §8): https://docs.expo.dev/push-notifications/sending-notifications/
- Resend, Data Processing Addendum, last updated 31 December 2025: https://resend.com/legal/dpa ; GDPR page (US storage, per DI §9): https://resend.com/security/gdpr
- Twilio, Data Protection Addendum, last updated 9 April 2026: https://www.twilio.com/en-us/legal/data-protection-addendum
- Cloudflare, Customer DPA, version 6.4, effective 3 April 2026: https://www.cloudflare.com/cloudflare-customer-dpa/ ; Turnstile privacy addendum, last updated 18 June 2025: https://www.cloudflare.com/turnstile-privacy-policy/
- hCaptcha, privacy policy, last updated 7 October 2025: https://www.hcaptcha.com/privacy
- GitHub, Data Protection Agreement, version October 2025: https://github.com/customer-terms/github-data-protection-agreement
- Supabase, CAPTCHA: https://supabase.com/docs/guides/auth/auth-captcha (per the gap analysis, OPS-9)
- UK-US data bridge: https://www.gov.uk/government/publications/uk-us-data-bridge-supporting-documents
- ICO, international transfers (search extract only): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/
- The gap analysis, rows PRV-6, PRV-15, PRV-17, WEB-7, OPS-9, SI-10, SI-12 and items A18, F7, F8, F9, F16: `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`
- `research_notes/App Store readiness/uk-eu-law.md` (LAW-9, LAW-10) and `audit-data-inventory.md` (§9, §13, §14)
