# Appropriate policy document: criminal offence data in reports

| | |
|---|---|
| **Controller** | Resbite Ltd, a private limited company registered in England and Wales, company number 12450334. Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom. Data protection contact: privacy@resbite.com |
| **Owner of this record** | The owner, for Resbite Ltd |
| **Version** | 1.0 — draft for solicitor review (decision D-12). Not adopted. |
| **Date** | 17 November 2026 |
| **Next review** | When the solicitor confirms the condition (D-22). Then by 17 November 2027, and whenever the processing in section 2 changes. |
| **Purpose** | To explain how we keep to the data protection principles, and how long we keep data, when we process allegations of criminal offences in reports, as DPA 2018 Schedule 1 paragraph 39 requires. |
| **Gap analysis item** | A23, closing row PRV-18 of `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md` |

> **Needed only if the Schedule 1 condition the solicitor chooses (D-22) requires one.** Most of the likely conditions do (section 3). If the solicitor picks a condition that does not, we keep this document anyway as our internal policy for this data, and the records of processing (A8) still name the condition.

## Placeholders to fill

1. [[OWNER: the DPA 2018 Schedule 1 condition for criminal offence data in reports, chosen with the solicitor — proposed: paragraph 12 (regulatory requirements relating to unlawful acts), with paragraph 10 (preventing or detecting unlawful acts) as the alternative, each extended to criminal offence data by paragraph 36; paragraph 18 (safeguarding) for child-safety reports; paragraph 33 (legal claims) for records under a legal hold]] (section 3.1)
2. [[OWNER: the condition, if any, for special category data that appears in reports — proposed: ask the solicitor; paragraph 18 (safeguarding) for child-safety reports]] (section 6)
3. [[OWNER: the backup moderator's identity — recorded only in the signed team access agreement kept outside the repo; the repo records only that a backup is named, and the date — proposed: one named person at the Supabase Developer role with MFA, named before the 1.0 submission]] (section 4.1)
4. [[OWNER: the date this document is adopted — proposed: no later than the 1.0 release, and before relying on the condition]] (section 7)

## How to read this

- **Structure.** It follows the ICO's appropriate policy document template (read through search extracts, because ico.org.uk refused automated reads): the data, the condition, the procedures for each principle, and retention and erasure. The ICO says the template is a guide and need not be followed exactly.
- **Law.** UK GDPR Art 10; DPA 2018 s.10(5), s.11(2) and Schedule 1 paragraphs 5, 10, 12, 36 and 38 to 41. legislation.gov.uk refused automated reads on 17 November 2026, so the wording below is from the long-standing text and search extracts. Check it against the live page.
- **Target state.** This document describes Resbite at version 1.0, after workstreams B, C, D and F are built with the gap analysis' recommended defaults. Each measure carries its status on 17 November 2026: **Live**, or **To build** with the workstream id.
- **The regulator** is the Information Commission, which took over the Information Commissioner's Office's functions on 30 September 2026 and still uses the name ICO (ico.org.uk). This document calls it "the ICO".
- **No personal data.** Roles only: "the owner", "the backup moderator".

---

## 1. Why this document exists

People report messages and people in the app, and write to our support inbox about what happened. Many reports say, or imply, that someone committed an offence: harassment, threats, stalking, sharing an intimate image without consent, cyberflashing, or child sexual abuse.

- **This is criminal offence data.** DPA 2018 s.11(2) says that data relating to criminal offences includes data relating to "the alleged commission of offences by the data subject". An allegation counts, even if nobody is charged. The ICO takes the same view [ICO-COD] (x).
- **Art 10 applies.** We may process it only when the law authorises it. In the UK that means meeting a condition in Part 1, 2 or 3 of DPA 2018 Schedule 1 (s.10(5)), on top of an Art 6 lawful basis.
- **Some conditions need this document.** A condition in Schedule 1 Part 2 is met only if, when the processing is carried out, the controller has an appropriate policy document in place (paragraph 5). That applies when a Part 2 condition is used for criminal offence data through paragraph 36.
- **What the document must contain** (paragraph 39): an explanation of our procedures for securing compliance with the Art 5 principles for this processing, and of our policies on retention and erasure, with an indication of how long the data is likely to be kept. Sections 4 and 5 do this.
- **What we must do with it** (paragraph 40): keep it from when the processing starts until six months after it ends, review and update it from time to time, and give it to the ICO on request, free.
- **One exception.** Under paragraph 10(2), disclosing data to a competent authority (such as the police or the National Crime Agency), or preparing to disclose it, meets that condition without an appropriate policy document. All our other processing of this data still needs one.

---

## 2. Description of the data processed

### 2.1 Where the data is

| Record | What it holds | Where | Status |
|---|---|---|---|
| **In-app reports** (`private.reports`) | Who reported; who was reported; the message (if any); the resbite; whether a message or a person was reported; the reason; up to 500 characters of the reporter's own words; a frozen copy of the reported message's words and author; the status, the team's note, the action and the times (`supabase/migrations/20261111160000_chat_safety.sql:763-780`) | Supabase, London | Live |
| **Report reasons** | Today: Harassment, Spam, Not appropriate, Something else (`mobile/src/domain/safetyCopy.ts:14`). At 1.0 also "Illegal or dangerous", "Child safety" and "Intimate image shared without consent", ordered first for triage (B7, C7) | App and server | To build (new reasons) |
| **Suspension records** (`private.suspensions`) | The suspended account, the report that led to it, what the suspension changed, and when (`supabase/migrations/20261111160000_chat_safety.sql:794-800`) | Supabase, London | Live |
| **Removed messages** | A message the team removes loses its words and reads "removed by Resbite"; the words survive only in the report's frozen copy (`supabase/ops/remove-reported-message.sql:1-13`) | Supabase, London | Live |
| **Support and privacy inbox messages, and the `/support` contact form** | Reports from people who are not users (affected persons, UGC-9), intimate image reports (UGC-10), appeals (A5), third-party legal complaints (UGC-14), and messages from the police or regulators | The mailbox provider recorded in A18 | To build (F1, D1) |
| **Case records outside the repo** | Notes on a case where needed; the record of a report to the National Crime Agency (Online Safety Act s.66); the law-enforcement and regulator request log; legal hold records | The tool recorded in A18 | To build (A15, A22, F2, F17, C6) |

**Out of scope.** Blocks carry no allegation and are not criminal offence data. The blocked-terms filter refuses a message and stores nothing (`supabase/migrations/20261111160000_chat_safety.sql:999-1001`).

### 2.2 Whose data

- **Reported people**, about whom an allegation is made.
- **Reporters**, who are often the victims.
- **Others named or shown** in reported content.
- **Affected persons who are not users**, who report through `/support`.
- **The team**, as the people who act on reports.

### 2.3 What we do with it

1. **Receive** a report in the app or through the support inbox.
2. **Read** it in the daily read (`supabase/ops/open-reports.sql`), which shows the reason, the reporter's words, the frozen copy, the two display names and the resbite, and no phone number or email.
3. **Decide** whether the content is illegal or breaks our Terms. For the Online Safety Act we judge whether there are reasonable grounds to infer that content is illegal (s.192; text not re-read). We do not decide whether anyone is guilty of a crime.
4. **Act**: remove a message, a photo, a title or a cover; suspend an account (C6 adds the missing scripts).
5. **Record** the decision on the report: status, action, note and time (`supabase/ops/close-report.sql:1-12`).
6. **Tell** the reported person what we did and why, and how to appeal (statement-of-reasons templates, A15).
7. **Handle appeals and complaints** (A5).
8. **Report** child sexual exploitation and abuse content to the National Crime Agency (Online Safety Act s.66), and respond to Ofcom information notices and lawful police requests (A22).
9. **Hold** records under a legal hold when the law or a live matter requires it (A22, C6).
10. **Delete** on the schedule in section 5.

### 2.4 What we never do

- Run criminal records checks or ask for conviction data.
- Score, rank or profile people by their reports.
- Make automated decisions about people from reports.
- Tell a reported person who reported them.
- Share reports with other users, or use them for any other feature, marketing or analytics.
- Disclose them to anyone outside the procedure in A22.

---

## 3. The Schedule 1 condition

### 3.1 The condition we rely on

[[OWNER: the DPA 2018 Schedule 1 condition for criminal offence data in reports, chosen with the solicitor — proposed: paragraph 12 (regulatory requirements relating to unlawful acts), with paragraph 10 (preventing or detecting unlawful acts) as the alternative, each extended to criminal offence data by paragraph 36; paragraph 18 (safeguarding) for child-safety reports; paragraph 33 (legal claims) for records under a legal hold]]

Paragraph 36 lets a Part 2 condition authorise criminal offence data without its requirement that the processing be "necessary for reasons of substantial public interest". The other parts of the condition still apply, and so does paragraph 5 (this document).

### 3.2 The candidates, for the solicitor

Which condition fits moderation under the Online Safety Act is UNVERIFIED (open question 26 of the gap analysis). The wording below is summarised from the long-standing text (not re-read).

| Condition | What it requires (summary) | How it fits | Needs this document? |
|---|---|---|---|
| **Paragraph 12**, regulatory requirements relating to unlawful acts and dishonesty | Necessary to comply with, or help others comply with, a regulatory requirement that involves taking steps to establish whether someone has committed an unlawful act or been involved in seriously improper conduct; and we cannot reasonably be expected to get the person's consent. A "regulatory requirement" includes one imposed by legislation | The Online Safety Act requires us to take down illegal content swiftly once we know of it (s.10), which means judging whether content amounts to an offence (s.192). Our reading: the closest fit. UNVERIFIED | Yes |
| **Paragraph 10**, preventing or detecting unlawful acts | Necessary to prevent or detect an unlawful act, and must be done without the person's consent so as not to prejudice that purpose | Removing content and suspending accounts stops further offences on the service; we cannot ask a reported person's consent first. Disclosures to a competent authority need no appropriate policy document (paragraph 10(2)) | Yes, except disclosures to a competent authority |
| **Paragraph 6**, statutory purposes | Necessary for the exercise of a function conferred on a person by an enactment | Uncertain whether a duty placed on a private provider is a "function conferred" | Yes |
| **Paragraph 11**, protecting the public | Necessary for a function meant to protect the public against dishonesty, malpractice or other seriously improper conduct, without consent | Possible for harassment and threats; a less direct fit | Yes |
| **Paragraph 18**, safeguarding of children and individuals at risk | Necessary to protect someone under 18, or an adult at risk, from harm, without consent for a listed reason | Child-safety reports and under-18 accounts (UGC-11) | Yes |
| **Paragraph 33** (Part 3), legal claims | Necessary for legal proceedings, legal advice, or establishing, exercising or defending legal rights | Records under a legal hold, or kept to defend a challenge; not a general basis for moderation | No |
| **Paragraph 30** (Part 3), vital interests | Necessary to protect someone's vital interests when consent cannot be given | An emergency disclosure on a threat to life (A22) | No |
| Paragraph 29 (Part 3), consent | The person consents | Not suitable: a reported person will not consent, and a reporter's consent cannot cover the person they accuse | — |

Whether the Data (Use and Access) Act 2025 changed any of these conditions is UNVERIFIED; the solicitor is asked to check.

### 3.3 The Art 6 basis beside it

| Processing | Art 6 basis |
|---|---|
| Moderation to meet the Online Safety Act duties (ss.10, 20, 21) | Legal obligation, Art 6(1)(c) |
| Enforcing our Terms beyond those duties, and keeping evidence for 180 days | Legitimate interests, Art 6(1)(f), with an LIA (A10) |
| Reports to the National Crime Agency (s.66) and answers to Ofcom notices (s.100) | Legal obligation, Art 6(1)(c) |
| Other disclosures to the police | Recognised legitimate interest (crime, safeguarding, emergencies), or legal obligation where we are compelled (A22) |

---

## 4. Procedures for securing compliance with the principles

### 4.1 Accountability

- **Who is responsible.** The owner, who is also the named accountable individual for our Online Safety Act duties (decision D-6; Ofcom Code measure ICU A2).
- **Who handles the data.** Only the owner and one backup moderator [[OWNER: the backup moderator's identity — recorded only in the signed team access agreement kept outside the repo; the repo records only that a backup is named, and the date — proposed: one named person at the Supabase Developer role with MFA, named before the 1.0 submission]], under written instructions and a confidentiality agreement (A24), with MFA (F16). **To build** (C5, A24, F16).
- **Processors.** Supabase hosts the reports; the mailbox provider holds support emails; the tool in A18 holds case records and logs. Each has an Art 28 contract recorded in A18 (F7). **To build** (confirm contracts).
- **Records.** The records of processing (A8) carry the paragraph 41 entries: the condition relied on, how the processing meets Art 6, and whether we keep and delete the data as section 5 says (and if not, why). The DPIA (A9, risk R16), the moderation standard (A15) and the law-enforcement procedure (A22) sit beside this document.
- **Every action is recorded** on the report: status, action, note and time. **Live.**
- **Review.** Yearly (F15) and before any change in section 7.
- **Breaches** follow A17.

### 4.2 Lawfulness, fairness and transparency (principle (a))

**Lawful.** We process this data only under the condition in section 3.1 and the Art 6 basis in section 3.3.

**Fair.**
- We record an allegation as an allegation, in the reporter's own words, never as a finding.
- A person decides, on what they can see. When the grounds are unclear, we take no action and close the report as reviewed.
- Our decision is about content and our Terms, never about guilt.
- The reported person is told what we did and why, and how to appeal (A15, A5). **To build.**
- We never tell a reported person who reported them, including in answer to a subject access request (A16, DPA 2018 Schedule 2 protection of other people's data). **To build** (A16, C6).

**Transparent.**
- The Privacy Notice (A1) says that reports are kept for 180 days after we close them, that they may include allegations of offences, which condition we rely on, and that we may report to the National Crime Agency, the police or Ofcom where the law requires. **To build** (D1).
- The Terms (A3) describe our rules, removal, suspension, appeals and the 48-hour intimate image takedown. **To build** (D1).
- Data & privacy already says: "If you report a message or a person, the Resbite team reads the report and keeps a copy of what was reported, even if the message or that person's account is deleted. If you delete your account, the reports you sent are deleted too. A report is deleted 180 days after the team closes it." (`mobile/src/domain/safetyCopy.ts:85-86`). **Live.**

### 4.3 Purpose limitation (principle (b))

- We use this data only to keep people safe on Resbite, meet our Online Safety Act duties, enforce our Terms, deal with legal claims, and make disclosures the law requires or allows.
- We do not use it for any other purpose. Other users see only "Message removed by Resbite"; the reporter is told the report was received.
- Disclosures follow A22: check who is asking and on what legal basis, disclose the minimum, log it.
- Any new use needs a new assessment, and an update to this document and the DPIA, before it starts.

### 4.4 Data minimisation (principle (c))

- The report form asks for a reason and optional words, up to 500 characters. **Live.**
- The frozen copy is of the one reported message, not the conversation. **Live.**
- The daily read shows display names, not phone numbers or emails. **Live.**
- When a reported account is gone or being deleted, closing the report forgets who it was about; the frozen words stay (`supabase/ops/close-report.sql:6-8`). **Live.**
- The team reads the report queue, not whole chats. If a report needs context, they read only the reported chat and only what they need (A15, A24). **To build.**
- We never ask anyone to send us an intimate image or abuse material. We ask where it is (which resbite, which profile) and act there. Child sexual abuse material is preserved where it is, reported to the National Crime Agency and never forwarded or downloaded (A15). **To build.**
- Exports for a data request leave out other people's data (A16, C6). **To build.**

### 4.5 Accuracy (principle (d))

- The frozen copy keeps the exact words at the moment of the report, even if the author later deletes the message or their account. **Live.**
- The team's note records what was decided and why. **Live.**
- A reported person can appeal (A5) and ask us to correct our record (Art 16). We add the correction as a note; the reporter's words stay as theirs, because they are a record of what was alleged. **To build** (A5, A16).
- If an appeal succeeds, we restore what we can (for example, lift a suspension with the C6 lift step, which keeps the record and the lift date; until it exists, the undo in `supabase/ops/suspend-account.sql`, noted in the moderation log) and record the outcome on the report. **Live** (undo); **To build** (lift step C6, appeal procedure).

### 4.6 Storage limitation (principle (e))

See section 5.

### 4.7 Integrity and confidentiality: security (principle (f))

- **Locked tables.** `private.reports` and `private.suspensions` have row-level security on, no policy, and no grant to any role, including `service_role` (`supabase/migrations/20261111160000_chat_safety.sql:785-786,802-803`). Only the owner's scripts in the Supabase SQL editor read them. **Live.**
- **Two people only**, with MFA, written instructions and confidentiality, an access review every six months and an offboarding checklist (A24, F16). **To build.**
- **No report content in pushes.** A moderator's push says only "A new report is waiting." (`supabase/functions/_shared/notification-copy.ts:167`). **Live.**
- **No copies.** No screenshots, downloads or exports to personal devices; no forwarding of reported content (A24, A15). **To build.**
- **Inboxes and logs.** The support and privacy inboxes and the case-record tool are limited to the owner and the backup moderator, with MFA (F1, F16, A18). **To build.**
- **Hosting.** Supabase in London (`eu-west-2`), with 7-day backups. **Live.**
- **Breaches** follow A17. **To build.**

---

## 5. Retention and erasure

| Record | How long we keep it | What happens then | How | Status |
|---|---|---|---|---|
| Open report | Until the team closes it. The standard is action within 24 hours, and within 48 hours for an intimate image (A15) | Closed, with the decision recorded | `supabase/ops/close-report.sql` | Live (script); To build (standard) |
| Closed report | 180 days after closing (decision R-Q3) | Deleted | A C3 job (today the owner runs `supabase/ops/purge-closed-reports.sql`) | Live (manual); To build (job) |
| Who a closed report was about, once that account is gone or being deleted | Until the report is closed, or the next purge run | The reported id and the frozen author are cleared; the words stay until the 180 days end | `close-report.sql`, `purge-closed-reports.sql` | Live |
| Reports filed by someone who deletes their account | Until their deletion request | Deleted, unless a legal hold names them (`supabase/migrations/20261111160000_chat_safety.sql:1295`) | The deletion request (C2), with the legal hold | To build (C2) |
| Words of a removed message | Blanked at removal | The row stays until chat retention deletes it (90 days after a one-off's chat closes; 12 months in a group) | C3 | Live (blanking); To build (retention) |
| Suspension record | While suspended, then 12 months after the suspension ends, whether it is lifted or the account is deleted (D-8 with D-19) | Deleted | C3; C2 keeps it past the account's deletion | To build (see section 8, point 4) |
| Support and privacy inbox messages, and case records, that hold allegations | 24 months after the case closes (D-8 default) | Deleted from the mailbox and the tool | F1, F3, F4 | To build (see section 8, point 5) |
| National Crime Agency report records and the law-enforcement and regulator request log | 24 months after the case closes, longer under a legal hold | Deleted | A22, F17 | To build |
| Any record under a legal hold | Until the hold is lifted (A22 sets how a hold is set, reviewed and lifted) | The normal period resumes | C2, C3 and the C6 hold script respect the hold | To build |
| Backups | 7 days, rolling | Overwritten | Supabase | Live |
| Supabase logs | 7 days | Overwritten | Supabase | Live |

**How we erase.** Rows are deleted from the database; emails and case records are deleted from the mailbox and the tool. Deleted data stays in backups for up to 7 days; if we ever restore a backup, we replay the deletions recorded since (the restore procedure under decision D-4, C2).

**Requests to erase.** A reporter or a reported person can ask us to delete their data (A16). We delete it unless an exception applies, for example while we need it to meet a legal obligation or for a legal claim, and we say why.

**Checking.** Each yearly review checks that the jobs ran and that no closed report is older than 180 days. The result goes into A8 (paragraph 41(c)).

---

## 6. Special category data in reports

Reports can reveal special category data: a hate-speech report may reveal someone's religion or sexual orientation, and a self-harm report their health. Paragraph 36 lifts the substantial public interest test only for criminal offence data, not for special category data. If the solicitor advises that we need a separate condition for this, [[OWNER: the condition, if any, for special category data that appears in reports — proposed: ask the solicitor; paragraph 18 (safeguarding) for child-safety reports]], this document can cover it too: the procedures in section 4 and the periods in section 5 apply unchanged.

---

## 7. Keeping and reviewing this document

- **Adopted:** [[OWNER: the date this document is adopted — proposed: no later than the 1.0 release, and before relying on the condition]].
- **Kept** while we process this data and for six months after we stop (paragraph 40).
- **Given to the ICO** on request, free of charge.
- **Reviewed** yearly (F15), and before any of these: new report reasons; images or files in chat; a new vendor that holds reports or support emails; a change to who on the team has access; a new storefront (the EU); a change to the retention periods; any new use of reports.

| Version | Date | Change |
|---|---|---|
| 1.0 | 17 November 2026 | First draft, for solicitor review |

---

## 8. Open points

For the solicitor:
1. **Which condition** (D-22), and whether this document is required (section 3).
2. **Special category data** in reports (section 6).
3. **Whether the Data (Use and Access) Act 2025 changed** any Schedule 1 condition relevant here (UNVERIFIED).

For the owner:
4. **Suspension records and deletion.** The D-8 default keeps a suspension record 12 months after it is lifted, and D-19 lets a suspended person delete their account. In the code, `private.suspensions` is deleted with the Auth user (`on delete cascade`, `supabase/migrations/20261111160000_chat_safety.sql:795`), so the record goes when cleanup removes the account. The public documents and A12 follow D-19's default: the record is kept 12 months after the deletion (it also helps with ban evasion, D-25). C2 must build that, or the public documents must change.
5. **Two periods for the same kind of allegation.** An in-app report is deleted 180 days after closing, but the same allegation sent to the support inbox is kept 24 months (D-8 default for support records). Consider deleting allegation content in support cases after 180 days too, keeping only a note that the case existed.
6. **Reports filed by someone who deletes their account** are deleted at once (the code above). That suits the reporter, but it can destroy evidence of an offence. The legal hold covers only cases already flagged. Confirm this is the intended balance.
7. **The National Crime Agency's own rules** on keeping a record of a CSEA report may set a different period (UNVERIFIED; check with the NCA onboarding, UGC-8).

---

## Sources

- UK GDPR Art 5, Art 6, Art 10 [UKGDPR] (text not re-read).
- Data Protection Act 2018 s.10(5), s.11(2) and Schedule 1 paragraphs 5, 6, 10, 11, 12, 18, 29, 30, 33, 36 and 38 to 41 (text not re-read; legislation.gov.uk refused automated reads on 17 November 2026): https://www.legislation.gov.uk/ukpga/2018/12/schedule/1
- ICO, criminal offence data and the conditions for processing [ICO-COD] (x): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/criminal-offence-data/what-are-the-conditions-for-processing/ ; extract confirming that under conditions 10 and 27 no appropriate policy document is needed to disclose data to the relevant authorities.
- ICO, appropriate policy document template (structure read through search extracts): https://ico.org.uk/media/2616286/appropriate-policy-document.docx
- The Information Commission succeeds the ICO [IC-NAME]: https://www.gov.uk/government/news/information-commission-succeeds-the-ico-as-uks-data-protection-regulator
- Online Safety Act 2023 ss.10, 20, 21, 66, 100 and 192 [OSA-EXPL], [OSA-S10] (x), [OSA-S100] (search extract); s.192 text not re-read.
- Gap analysis rows PRV-18, UGC-8, UGC-9, UGC-10, UGC-11, UGC-14, UGC-15 and decisions D-6, D-8, D-19, D-22.
