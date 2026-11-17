# Public legal documents: index and change rules

**Owner:** the owner (for Resbite Ltd)

**Version:** 1.0

**Date:** 17 November 2026

**Next review:** at every change to a public document, and at least by 17 November 2027

**Purpose:** list Resbite's public documents, where each is published and which version is current, and set the rules for changing them.

> **Placeholders to fill**
>
> 1. The effective date of each document (one shared date is proposed): [[OWNER: effective date — proposed: the day the pages go live on link.resbite.com, after the solicitor's review and before the version 1.0 submission]]
> 2. The `TERMS_VERSION` value for Terms of Use 1.0: [[OWNER: the Terms version string for Terms of Use 1.0 — proposed: the year and month the Terms take effect, in the "YYYY-MM" form the database accepts, for example "2026-12"; it must differ from today's "2026-10"]]

This folder holds the source text of the documents published on the link site, `link.resbite.com`. None is published yet. Every version 1.0 is a draft for a UK solicitor's review (decision D-12 in `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`, confirmed by the owner as AS-D7 in `knowledge-base/08-decisions.md`). The drafts follow the owner's answers and the rulings of 17 November 2026 (AS-D1 to AS-D8, AS-R1 to AS-R9). The questions the solicitor is asked to answer are at the end of this file.

## The documents

| Document | Source file | Published at | Version | Status | Effective date | Gap-analysis deliverable |
|---|---|---|---|---|---|---|
| Privacy Policy | `privacy-notice.md` | https://link.resbite.com/privacy | 1.0 | Draft for solicitor review, not yet published | [[OWNER: effective date — proposed: the day the pages go live on link.resbite.com, after the solicitor's review and before the version 1.0 submission]] | A1, with A2 and A20 as sections |
| Terms of Use | `terms-of-use.md` | https://link.resbite.com/terms | 1.0 (`TERMS_VERSION` [[OWNER: the Terms version string for Terms of Use 1.0 — proposed: the year and month the Terms take effect, in the "YYYY-MM" form the database accepts, for example "2026-12"; it must differ from today's "2026-10"]]) | Draft for solicitor review, not yet published | As above | A3 |
| Support and contact, with Complaints and appeals | `support.md` | https://link.resbite.com/support | 1.0 | Draft for solicitor review, not yet published | As above | A4, with A5 as a section |
| Delete your account | `delete-account.md` | https://link.resbite.com/delete-account | 1.0 | Draft for solicitor review, not yet published | As above | A6 |
| Invitation page notice (short) | `invitee-notice-short.md` | Beside the number field on `/r/` and `/i/`, with the right-to-object line on `/i/` | 1.0 | Draft for solicitor review, not yet published | As above | A2 (built by D3) |
| Community rules: short version and sign-up wording | `community-rules-short.md` | In the app: the chat rules sheet, the 18+ and Terms tick, the acceptance screen; on `/r/` and `/i/`: the tick | 1.0 | Draft for solicitor review, not yet published | As above | A3 (built by B1, B2, C7, D3) |

The open-source licence notices (A25) live in the app, not here.

**One name for each document.** The public documents, the app and App Store Connect call A1 the "Privacy Policy" (ruling AS-R5) and A3 the "Terms of Use". The app's tick and links already say "Privacy Policy", and Apple's field is the "Privacy Policy URL", which points at `/privacy`. The source file keeps its name, `privacy-notice.md`. The regulator is named the same way everywhere: "the Information Commission (ICO)", which took over from the Information Commissioner's Office on 30 September 2026 and still uses the name ICO (ico.org.uk).

## Where each URL is used

Each URL is fixed in places that are slow to change. A wrong or missing URL means a new app build.

| URL | App Store Connect | In the app | Link site | Auth emails |
|---|---|---|---|---|
| `/privacy` | Privacy Policy URL | Data & privacy and About and legal; the welcome and sign-in screens; the 18+ and Terms tick (`EXPO_PUBLIC_PRIVACY_URL`) | Footer on every page; the tick line and the notice beside the number field (`PRIVACY_URL`) | Footer |
| `/terms` | Linked in the description | The same places as `/privacy` (`EXPO_PUBLIC_TERMS_URL`) | Footer; the tick line (`TERMS_URL`) | Footer |
| `/support` | Support URL | About and legal. The Contact topic and the report thanks show the support address (`EXPO_PUBLIC_SUPPORT_ADDRESS`) | Footer | The support address in the footer |
| `/delete-account` | Privacy Choices URL | Not linked: the app has its own Delete account screen | Footer; linked from `/support` | — |

## Rules for changing a public document

1. **Every change bumps the version.** Even a typo fix.
   - Change the second number (1.0 → 1.1) for wording that doesn't change what we do or what people can do.
   - Change the first number (1.1 → 2.0) for a change of substance: new data, a new purpose or vendor, new rights or duties, new times or periods.
   - Update the effective date and record the change in the change log below.
2. **Change the file here first.** The link site renders its pages from these files when it is built (`links/generate.mjs`), so the next approved deploy publishes the change. A build for production refuses a file that still has a placeholder or its draft status. The published page must never differ from the file.
3. **Changes of substance go to the solicitor before they are published** (D-12), and so does every first version.
4. **Keep the documents consistent with each other and with the app.** The retention periods, the deletion steps, the report reasons and the contact details appear in several documents and in the app's own text (Data & privacy, Delete account, the report sheet). Change them together.
5. **Keep the App Privacy answers in step.** When the Privacy Policy changes, check the App Store Connect App Privacy answers against it before the next submission.
6. **Keep every published version.** Record the commit of each published version in the change log, so that anyone can see the exact text a person agreed to.

### Extra steps for the Terms of Use

A change to the Terms, of any size, also needs a new `TERMS_VERSION`, so that people accept the version they are shown:

1. Set the new `TERMS_VERSION` in the app: `mobile/src/domain/guestAccount.ts`, the constant `TERMS_VERSION` (today `"2026-10"`, line 4).
2. Set the same value on the link site: the Vercel variable `TERMS_VERSION`, and the fallback in `links/server/lib/options.mjs` (today `"2026-10"`, line 16), so a deploy without the variable still sends the right version.
3. Set it wherever the server keeps the current version, once the versioned acceptance (C8) adds one.
4. Use the form `YYYY-MM`. The database refuses any other form (`supabase/migrations/20261022120000_gi2_guest_accounts.sql`, line 27), so there can be only one Terms version a month, unless C8 changes the form.
5. Release the new app build and the link-site change together. The app's value is fixed when the build is made. Until the new build is in people's hands, the old build keeps recording the old version. The EAS build and the Vercel change each need the owner's approval at the time.
6. Accounts without the new version are asked to accept it once, on the acceptance screen (B2, C8).

## Change log

| Date | Document | Version | Change | Published commit |
|---|---|---|---|---|
| 17 November 2026 | Privacy Policy | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | Terms of Use | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | Support and contact | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | Delete your account | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | Invitation page notice (short) | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | Privacy Policy; Support and contact | 1.0 (draft) | The contact form sends through Resend; data protection, legal requests and deletion go to the privacy inbox | Not published |
| 17 November 2026 | Community rules: short version and sign-up wording | 1.0 | First draft, for solicitor review | Not published |
| 17 November 2026 | This index | 1.0 | First version | — |
| 17 November 2026 | All of the above | 1.0 (draft) | Cross-check before solicitor review: one name for A1 and the regulator; one effective-date placeholder; what deletion does to a host's resbites, the guest list, suspension records, legal-request address and the ban for child sexual abuse made the same everywhere | Not published |
| 17 November 2026 | All of the above | 1.0 (draft) | The owner's answers and the rulings (AS-D1 to AS-D8, AS-R1 to AS-R9): A1 named "Privacy Policy" everywhere; Twilio named as the SMS provider; a named backup moderator; reports outlive their reporter's account; the suspension record keeps only the reason and dates after deletion; web-only accounts deleted after 12 months without a resbite; the intimate image uploader suspended at once; legal requests to privacy@resbite.com; weekly-group chat history disclosed; the report thanks gives the review time; the questions for the solicitor listed below | Not published |
| 17 November 2026 | Privacy Policy; Delete your account; in-app Data & privacy | 1.0 (draft) | Final review: an invited non-user's number is kept until 30 days after the resbite ends, answered or not; the link site's answer session ends when the resbite ends; a replaced photo goes about 7 days later | Not published |

## Questions for the solicitor

The owner has confirmed that a UK solicitor reviews the public documents before they are published (decision AS-D7, D-12). These are the open legal points gathered from the documents in this folder, `docs/compliance/` and `qa/app-store-release/`. Each names where it is raised, so the answer can be written back there. Send the internal records (`docs/compliance/`) and the App Store Connect pack with the public drafts, so the solicitor sees what is promised and how it is run.

**Data protection**

1. **The Article 10 condition for reports.** Which DPA 2018 Schedule 1 condition covers the allegations of offences in reports, and whether the appropriate policy document is needed. Proposed: paragraph 12 (regulatory requirements relating to unlawful acts), with paragraph 10 (preventing or detecting unlawful acts) as the alternative, each extended to criminal offence data by paragraph 36; paragraph 18 (safeguarding) for child-safety reports; paragraph 33 (legal claims) for held records. Also whether the Data (Use and Access) Act 2025 changed any of these conditions. (D-22; `privacy-notice.md` sections 3.9 and 4; `docs/compliance/records-of-processing.md` section 7; `docs/compliance/appropriate-policy-document.md` sections 3 and 8; `docs/compliance/dpia.md` section 7.)
2. **The Article 9 condition for special category data in reports and content.** Whether a Schedule 1 condition is needed for health, religion, sexuality and the like that people reveal in chats and reports, beyond the criminal offence condition. Proposed: paragraph 18 for child-safety reports. (`docs/compliance/appropriate-policy-document.md` section 6; `docs/compliance/dpia.md` section 7; `docs/compliance/records-of-processing.md` section 8.)
3. **Article 14(3)(b) for invitees.** A host's own WhatsApp or Messages text is the first communication an invited non-user receives; our notice (`invitee-notice-short.md`, and section 10 of the Privacy Policy) arrives only when the link is opened. Does the Article 14 and Article 21(4) information reach them "at the latest at the time of the first communication"? Should the host's invitation text carry a short privacy line? And is Article 14(5)(b) (disproportionate effort, with the public Privacy Policy) the right reading for numbers that are looked up but not stored? (`privacy-notice.md` drafting notes; `docs/compliance/dpia.md` section 7 and R3; `docs/compliance/legitimate-interests.md`, LI-2.)
4. **Discoverability and Article 21.** Anyone who has a user's number can see that they are "On Resbite" and invite them. This rests on legitimate interests, with no setting to hide it; blocking, objecting and deleting the account are the answers offered. Is that a sound balance, and does an objection from a user (rather than a non-user) need its own mechanism? Also whether the do-not-invite list rests on legitimate interests or on legal obligation (Article 6(1)(c) with Article 21). (`privacy-notice.md` sections 3.5, 4 and 11; `docs/compliance/legitimate-interests.md`, LI-1 and LI-4; `docs/compliance/records-of-processing.md`, LB-07; `docs/compliance/dpia.md`, R1.)
5. **PECR's strictly necessary exception for the CAPTCHA.** Whether the bot check's storage and reading on the phone and in the browser fall within regulation 6's strictly necessary exception, so no consent is asked, given that Cloudflare Turnstile also uses the signals for its own detection as a controller. The vendor is still open (decision AS-D5). (`privacy-notice.md` sections 3.11 and 9; `docs/compliance/vendors.md`, CAPTCHA vendor.)
6. **Service texts under PECR.** Texts to accounts with no email (a suspension notice, an identity check, a security warning) are sent by Twilio to the verified number. Confirm they are service messages, not direct marketing under regulation 22, and that the Privacy Policy describes them properly. (`privacy-notice.md` section 3.1; `docs/compliance/records-of-processing.md`, LB-11; `docs/compliance/moderation-standard.md` section 19.)
7. **Apple, Google and Apple's push service (APNs) as independent controllers.** Confirm the roles, which are inferred and UNVERIFIED (LAW-9), especially for APNs, which carries push text that Expo passes to it. (`privacy-notice.md` section 5.3; `docs/compliance/vendors.md`, Apple and Google; `docs/compliance/records-of-processing.md` sections 9 and 10.)
8. **No prior consultation with the ICO** (Article 36). Confirm that no residual risk in the DPIA is high, and that our reading of guideline 5.1.1(viii) for stored invitations and removal records is sound. (`docs/compliance/dpia.md` section 7.)
9. **Proof of age.** Whether, and how, Resbite may check the age of a person who disputes an under-18 finding without keeping identity documents, and the thresholds in the children's access assessment. (`docs/compliance/childrens-access-assessment.md` section 9.)

9a. **Invitation numbers after an answer.** The code keeps a non-user's number until 30 days after the resbite ends, even after they answer, because the personal link lets them change their answer until then. The Privacy Policy, the deletion page, the in-app Data & privacy page and the App Review notes now say so. Is that reading of "until answered or revoked" (D-8) sound, or must an answered invitation's number go at once? (`privacy-notice.md` sections 7 and 10; `delete-account.md`; `docs/compliance/retention-schedule.md` code note; AS-P6-2.)
9b. **A series hold and other people's deletions.** A hold on a resbite series does not stop another person deleting their own account, and so their records in that series; only a hold on that person does (ASR2-4). Should a series hold also pause other people's deletions, given UK GDPR Art. 17(3)(e) (legal claims)? (`docs/compliance/law-enforcement-requests.md` section 11; `docs/compliance/retention-schedule.md` section 14.)

**Online safety**

10. **The Online Safety Act wording.** Sections 9 to 11 of the Terms (community rules, how we keep Resbite safe, complaints and appeals), the support page and the moderation standard were written to OSA s.10 (in particular s.10(5) to (8), the terms of service duties) and s.21 (complaints), with s.20 (reporting), but the Act and Ofcom's guidance were read only through search extracts. Check them against the current text, Ofcom's final terms-of-service and complaints guidance, and Code measure ICU G1 for the statement on each kind of priority illegal content in section 10.1. (`terms-of-use.md`, open points 2 and 22; `support.md`; `docs/compliance/osa-illegal-content-risk-assessment.md` section 8.)
11. **When OSA s.20A comes into force.** The 48-hour intimate image duty (inserted by the Crime and Policing Act 2026 s.100) has an UNVERIFIED commencement date. The documents apply it from launch (D-21). Confirm the date and the wording. (`terms-of-use.md`, open point 15; `docs/compliance/moderation-standard.md` section 3.)
12. **"Communicated privately".** Whether resbite chats count as content communicated privately under Ofcom's guidance (relevant to Code measure ICU H1.8). (`docs/compliance/osa-illegal-content-risk-assessment.md` section 8.)
13. **CSEA records.** How long S.I. 2026/268 requires the content, user data and report reference of a report to the National Crime Agency to be kept (secondary sources say one and five years; UNVERIFIED). (`docs/compliance/moderation-standard.md` section 9.)
14. **Defamation and hosting.** Whether an app counts as a "website" for the Defamation Act 2013 s.5 process the support page follows, and how E-Commerce Regulations reg 19 applies. (`support.md`; `docs/compliance/moderation-standard.md` section 16.)
15. **Law-enforcement requests.** Whether Resbite counts as a "telecommunications operator" for Investigatory Powers Act 2016 Part 3 authorisations, the coroner's powers, and requests from outside the UK. Legal and police requests go to privacy@resbite.com (ruling AS-R7). (`docs/compliance/law-enforcement-requests.md` sections 4, 8 and 10.)

**Contact details, consumer law and Apple**

16. **Regulation 6(1)(c) contact means.** Whether email (support@resbite.com and privacy@resbite.com, decision AS-D3), a contact form and post to the registered office, with no public phone, give the "direct and effective" communication the E-Commerce Regulations ask for (DOC-3; CJEU C-298/07), and whether that meets Apple's "as local law may require" for the Support URL. Also whether section 2 of the Terms meets regulation 9. (`terms-of-use.md`, open point 15; `support.md`; `qa/app-store-release/app-store-connect-pack.md`, Support URL.)
17. **Apple's licence agreement.** Whether Apple's Standard EULA plus section 19.1 of the Terms (a promise not to rely on terms that clash with UK consumer law, and a "better for you" rule) works. (`terms-of-use.md`, open point 1.)
18. **Consumer law.** The Consumer Contracts Regulations 2013 for a free service and for later paid features; whether the ADR information duty applies and what the DMCC Act 2024 changes; CRA s.46 for free digital content; and whether to add a money cap on liability. (`terms-of-use.md`, open points 6 and 16.)
19. **The Declared Age Range question.** Whether the UK is a region where Apple legally requires developers to use the Declared Age Range API, even for an 18+ app (ASC-17, D-16). Ask Apple Developer Support or the solicitor before submission; if it is, it is built for 1.0. (`docs/compliance/childrens-access-assessment.md`, placeholder 3; `qa/app-store-release/app-store-connect-pack.md`, open point 3; `qa/app-store-release/README.md`.)
20. **App Privacy judgement calls.** The push token as Device ID, server logs not as Diagnostics, and the meeting place not as Physical Address or Shared Location. Check that the Privacy Policy describes them the same way. (`qa/app-store-release/app-store-connect-pack.md`, open points 2 and 8.)
21. **The backup moderator's agreement.** If the backup is unpaid, whether the agreement should be executed as a deed; if an employee or a contractor, how it fits their contract (the owner names the backup, decision AS-D6). (`docs/compliance/team-access.md`.)

**Names**

22. **The regulator's name.** The documents say "the Information Commission (ICO)", which took over from the Information Commissioner's Office on 30 September 2026 and still uses the name ICO. Confirm the form to use. (`terms-of-use.md`, open point 11; `docs/compliance/dpia.md` section 7.)

## Questions for the owner

1. **A held person who deletes their account.** Today their name, photo, places and chat messages stay visible to other people until the hold is lifted (the retention schedule says so). Should a held deletion hide and preserve them instead? That needs a new hidden marker on the profile, read by chat names, photos, guest lists and chat rows, and it must not set the deletion date, which would fire the plan redaction. (`docs/compliance/retention-schedule.md` section 14; `supabase/migrations/20261117110000_account_deletion_release.sql`.)
