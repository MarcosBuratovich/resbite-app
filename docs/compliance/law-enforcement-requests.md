# Law-enforcement and regulator requests, and legal holds

| | |
|---|---|
| **Owner** | The owner, for Resbite Ltd (the controller and the service provider) |
| **Version** | 1.0 — draft for solicitor review (decision D-12), not yet in force |
| **Date** | 17 November 2026 |
| **In force from** | [[OWNER: effective date — proposed: the day version 1.0 is released on the App Store]] |
| **Next review** | No later than 17 November 2027, and after the first real request (F15) |
| **Purpose** | How Resbite checks who is asking and on what legal basis, discloses only the minimum, acts in an emergency, answers Ofcom, and sets and lifts a legal hold so evidence is not destroyed. |

This is an internal procedure (gap analysis item A22; rows UGC-15 and UGC-8). It holds no personal data: people appear only by role. A UK solicitor reviews it with the public documents before launch (decision D-12). It is written to be complete and usable as it stands.

**What it describes.** Resbite at version 1.0, after workstreams B, C and D of the gap analysis are built, using the recommended default for every owner decision D-3 to D-25. A step that is not possible yet carries **[needs X]**. Section 15 lists them.

**References.** "The gap analysis" is `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`. Companion records in this folder: `moderation-standard.md` (A15: the CSEA report to the NCA, threats on sight), `data-requests.md` (A16), `breach-response.md` (A17), `records-of-processing.md` (A8: lawful bases LB-20 and the Art 10 condition), `retention-schedule.md` (A12), `team-access.md` (A24).

**The request log is kept outside the repo** (section 13).

## Placeholders to fill

1. [[OWNER: effective date — proposed: the day version 1.0 is released on the App Store]]
2. [[OWNER: tool that holds the moderation, request, complaint, breach and law-enforcement logs — proposed: one access-controlled spreadsheet in the mailbox provider's business workspace, under the same data processing agreement]]
3. [[OWNER: VAT number, or delete if not VAT-registered]] (in the signature of the letters, section 14)

---

## 1. Scope

| Who asks | What it usually is | Section |
|---|---|---|
| A UK police force | A voluntary request under the DPA 2018 crime exemption, a production order, a warrant, or an emergency | 4, 5 |
| The National Crime Agency (NCA) | Follow-up to a CSEA report we made, or its own request | 6 |
| Ofcom | An information notice, a data preservation notice, or an informal enquiry | 7 |
| A coroner | A notice requiring evidence or documents | 8 |
| A court, or a party's lawyers | A court order, a witness summons, a disclosure application, or a voluntary request | 9 |
| Another UK public body (for example HMRC or a local authority) | A request under a statutory power | 10 |
| An authority outside the UK | A direct request or order | 10 |

**Not here.** Making a CSEA report to the NCA, and calling 999 when a report shows someone in danger: `moderation-standard.md` sections 8.4 and 9. A person asking for their own data: `data-requests.md`.

## 2. Principles

- **A legal basis for every disclosure.** Know which one before anything leaves us, and record it.
- **Check who is asking**, every time, by a route we find ourselves.
- **The minimum.** Disclose only what the request needs and the basis allows. Message content and photos need more than account details (section 4.3).
- **Never by phone to an unchecked caller.** In an emergency, check by calling back through the control room (section 5).
- **The owner decides.** The backup moderator forwards requests to the owner and does not disclose, except in the emergency case in section 5.
- **Preserve on request.** A request to preserve is acted on at once with a legal hold (section 11), even before we decide whether to disclose.
- **Record everything** in the request log (section 13).

## 3. Who handles requests

The owner handles every request, with the solicitor's advice where this procedure says so. Requests arrive at privacy@resbite.com, which the support page names as the address for courts, the police and regulators (subject "Legal request"), or anywhere else; whoever receives one forwards it to the owner the same day. The backup moderator may make an emergency disclosure only as section 5 allows.

## 4. Police requests (not an emergency)

### 4.1 Steps

1. **Log it** (section 13) and note any deadline.
2. **Preserve** if asked, or if the data is short-lived: set a legal hold (section 11), and export time-limited records at once (IP addresses: `auth.sessions` until sign-out, platform logs for 7 days).
3. **Check who is asking.**
   - It comes from an official police address (ending in police.uk) or on the force's own form.
   - It names the officer, their rank, their warrant or collar number and their unit, and any authorising officer the force's form provides for.
   - **Call back** through the force's main switchboard, using a number we look up ourselves on police.uk, not the number in the request, and confirm the officer and the request.
4. **Check the legal basis and exactly what is asked** (section 4.2).
5. **Decide the minimum** (section 4.3). If the request is wider than its basis allows, ask the officer to narrow it, or to come back with an order (template L2).
6. **Disclose securely**: an encrypted file to the checked official address, with the cover note (template L3). Never to a personal address.
7. **Decide whether to tell the user** (section 4.4).
8. **Record** what was disclosed, when, to whom (the officer's work details), and on which basis.

### 4.2 Legal bases

| The request | What it means for us |
|---|---|
| **A voluntary request under the crime exemption** (DPA 2018 Schedule 2, Part 1, para 2) | We **may** disclose if we are satisfied that not disclosing would be likely to prejudice the prevention or detection of crime, or the arrest or prosecution of offenders. The exemption lifts the purpose limitation and transparency rules to that extent. The lawful basis is the recognised legitimate interest in crime (UK GDPR Art 6(1)(ea) and Annex 1, LB-20). Allegations are criminal offence data; the Art 10 condition is in `records-of-processing.md`. We decide case by case; the police cannot compel us with this route. |
| **A court order or warrant** (for example a production order under the Police and Criminal Evidence Act 1984, Schedule 1) | We **must** comply as the order says. Disclosure required by law is covered by DPA 2018 Schedule 2, Part 1, para 5. Ask the solicitor to read the order. |
| **An authorisation for communications data** under the Investigatory Powers Act 2016, Part 3 | May be compulsory for a "telecommunications operator". Whether Resbite counts as one is UNVERIFIED and for the solicitor (open point). Escalate to the solicitor before answering. |

### 4.3 What is the minimum

| Kind of data | Usually needs |
|---|---|
| **Account details**: account id, verified phone, sign-in email, sign-in methods, created, last sign-in | A voluntary request under para 2, checked, for a specific person and offence |
| **Session details**: IP addresses and devices in `auth.sessions`; platform log lines (7 days) | A voluntary request under para 2, checked; act fast, as they expire |
| **Content**: chat messages, photos, resbites and their meeting places, guest lists, connections | A court order or warrant, unless it is an emergency (section 5), or the content is the user's own report or complaint to us and they asked us to pass it on. Whether disclosing stored messages without an order could count as interception under the Investigatory Powers Act 2016 is a question for the solicitor (open point) |
| **Reports and the reporter's identity** | A court order, or the reporter's consent, except in an emergency. Never volunteered |

Use the export script **[needs C6]** for the person concerned, then cut it down to what the basis allows. Never give the police other users' data that the request does not need.

### 4.4 Telling the user

Our privacy notice says we may disclose data to the police where the law allows (A1). Whether to tell the person concerned about a particular disclosure:
- **Do not tell** them where the crime exemption applies because telling would be likely to prejudice the investigation, or where the police or an order ask us not to. Record that decision.
- **Otherwise** we may tell them, after checking with the officer.
- If the person later makes a data request, `data-requests.md` section 6.3 applies.

## 5. Emergencies: a threat to life or of serious harm

Resbite's resbites are in-person meet-ups, and their meeting places can be homes. A threat linked to a meet-up is the case to plan for.

**When we find it** (a report, a message, an email): **call 999 first**, then act on the content (`moderation-standard.md` section 8.4).

**When the police call us with an emergency:**
1. Take the officer's name, force and the control room's reference.
2. **Check** by calling back through 999 (if the danger is immediate) or the force's switchboard found on police.uk, and asking for the control room with that reference. Never use a number the caller gives.
3. **Disclose the minimum needed to prevent the harm**, now: for example, the account's phone number, or the place and time of a resbite. The lawful basis is the person's vital interests (Art 6(1)(d)) or the recognised legitimate interests in emergencies and safeguarding (Art 6(1)(ea), Annex 1), with the crime exemption (Schedule 2, Part 1, para 2).
4. **Set a legal hold** on the accounts and resbite concerned (section 11).
5. **Record it within 24 hours** (template L6): what was asked, how the caller was checked, what was disclosed, when, and why it could not wait.
6. **Ask for the written request afterwards**, and file it with the record.

**The backup moderator** may do steps 1 to 4 only when a life is at risk now and the owner cannot be reached within minutes, and must tell the owner as soon as possible. Their signed instructions say so (`team-access.md`).

## 6. The National Crime Agency

- **Our CSEA reports** go through the NCA's CSEA Industry Reporting Portal (`moderation-standard.md` section 9). The NCA may come back for more information about a report: check it is the NCA (through the portal or a call back to the NCA's published number), then answer as the 2026 Reporting Regulations and the request require.
- **Keep the held records** for the period the Regulations set: secondary sources say one year from the report for the content and user data, and five years for the report reference (UNVERIFIED; check S.I. 2026/268). Lift the hold only after that, and only if no investigation needs it.
- **Any other NCA request** follows section 4.

## 7. Ofcom

### 7.1 Information notices

Ofcom can require any provider of a regulated service to give it information it needs for its online safety functions (Online Safety Act 2023 s.100), by an information notice (s.102). A notice is binding.

1. **Log it** and note the deadline the notice gives.
2. **Preserve** everything the notice could cover: set legal holds (section 11), and pause any deletion of the information asked for. Destroying or altering information a notice requires is an offence (s.109; the exact wording of its limbs is UNVERIFIED in this draft).
3. **Tell the solicitor** the same day.
4. **Gather an accurate, complete answer.** Giving false information is an offence (s.109). If something cannot be given in time, tell Ofcom before the deadline and explain why.
5. **The owner signs off** the answer, as the named accountable individual (ICU A2). A notice may require us to name a senior manager responsible for compliance (s.103).
6. **Record** the notice, the answer and the date sent.

Typical things Ofcom may ask for: the illegal content risk assessment and its records (A13), the children's access assessment (A14), this procedure and `moderation-standard.md`, figures on reports and actions (`moderation-standard.md` section 22).

### 7.2 Data preservation notices

Since 30 September 2025, a coroner investigating the death of a child can ask Ofcom to require providers to preserve information about the child's use of their service (Online Safety Act 2023 s.101, as amended by the Data (Use and Access) Act 2025 s.124). Which services the duty covers (s.101 as amended) is UNVERIFIED for Resbite (open point). On any such notice: set a legal hold covering everything it describes at once, keep it for as long as the notice says, and follow section 7.1.

### 7.3 Informal enquiries

Answer promptly and accurately, as if they were formal. Ask whether Ofcom intends to follow with a notice.

## 8. Coroners

A coroner can require a person to give evidence or produce documents (Coroners and Justice Act 2009, Schedule 5; the provision is UNVERIFIED in this draft). Treat a coroner's notice as binding: log it, set a hold, tell the solicitor, and answer by the deadline.

## 9. Courts and civil claims

- **A court order** (for example a disclosure order, a Norwich Pharmacal order identifying a wrongdoer, a witness summons): comply as it says, with the solicitor's advice.
- **A voluntary request from a party's lawyers**: do not disclose without a court order unless the solicitor advises that disclosure is necessary for legal proceedings and lawful (DPA 2018 Schedule 2, Part 1, para 5). Ask them for an order (template L4).
- **A defamation complainant asking who posted something**: we release a poster's details only with their consent or under a court order (`moderation-standard.md` section 16.1).
- **A claim against Resbite** (or one we expect): set a hold on the records concerned.

## 10. Other public bodies, and authorities outside the UK

- **A UK public body** (HMRC, a local authority, another regulator): ask it to name the statutory power it relies on, check it is real and covers us, and disclose the minimum. Requests from a public body for its public task are a recognised legitimate interest (Annex 1). Take advice when unsure.
- **An authority outside the UK**: do not answer a direct foreign request or order without the solicitor's advice. The usual route is mutual legal assistance through the UK's central authority. In a genuine emergency abroad, pass the information to UK police through 999 or 101 rather than abroad directly.

## 11. Legal hold

A legal hold stops Resbite's own deletion and retention jobs destroying records that may be needed as evidence or that the law requires us to keep.

### 11.1 When to set one

- Every CSEA case (`moderation-standard.md` section 9).
- An intimate image case where the person shown wants to go to the police, or the police ask.
- A threat, terrorism or emergency case.
- A police, NCA, Ofcom, coroner or court request, or a request to preserve.
- A claim by or against Resbite Ltd, or one we reasonably expect.

### 11.2 How to set it

The owner runs the hold script **[needs C6]**, naming:
- the scope: the account ids and, if needed, the resbite series concerned;
- the reason code (CSEA, intimate image, threat, police, NCA, Ofcom, coroner, court, claim);
- the case number from the moderation or request log;
- the review date, three months ahead.

The backup moderator may set a hold in a CSEA or intimate image case. Ids go into the SQL editor's copy only; the hold register in the log tool (section 11.6) holds the details.

### 11.3 What it stops at 1.0

- **Account deletion.** The deletion request is still accepted and the account loses access at once, but erasure of the held records waits until the hold is lifted **[needs C2]**.
- **The retention jobs** for the held records: chat messages, plans and guest rows, join requests, invitations and removal records, notifications, connection refusals, closed reports, suspension records, deletion receipts, and the photo and cover clean-up, including the 7-day orphan photo clean-up **[needs C3]**.
- **Team removals.** The removal scripts take content down from view in "hide and preserve" mode instead of deleting the file **[needs C6]**.

### 11.4 What it does not stop

- `supabase/ops/purge-closed-reports.sql`, run by hand, does not know about holds. Do not run it while a hold covers a closed report. The C3 job that replaces it respects holds **[needs C3]**.
- A user deleting their own message, or a host removing one: the words go. A report about that message keeps its frozen copy.
- `supabase/ops/remove-reported-message.sql` blanks the message's words; the report's frozen copy remains.
- Deleting a user from the Auth dashboard bypasses everything: never do it (`data-requests.md` section 8.2).
- **Records outside the database:** backups and Supabase platform logs roll over after 7 days; Vercel logs after hours to a day; Expo keeps push receipts for a day. Export what the case needs at once into the case folder in the log tool, restricted to the owner, and record what was exported.
- **The inboxes and the log tool:** mark the emails and log rows concerned as held, and do not delete them.

### 11.5 Review and lifting

- Review every hold on its review date (`moderation-standard.md` section 4, step 9).
- Lift it when its reason has ended: the authority confirms it no longer needs the records; the proceedings or claim have ended or the time to bring them has passed; the statutory period has ended (for a CSEA report, see section 6).
- Lift it with the hold script **[needs C6]**. The normal retention periods then apply again: anything already past its period goes at the next job run, and a deletion request that was waiting completes.
- Delete any exported copies in the case folder when the hold is lifted.

### 11.6 The hold register

In the log tool, one row per hold: hold number; date set; set by (role); reason code; case number; authority and its reference; scope (account ids, series); what was exported outside the database; review dates; date lifted; lifted by (role).

## 12. If someone asks us to keep a request secret

Authorities sometimes ask us not to tell the user. We follow such a request where the crime exemption applies or an order requires it, and record it. If a request seems unjustified, ask the solicitor. We never mislead the user, but we may decline to say whether a request exists.

## 13. The request log

Kept outside the repo, in the log tool (placeholder 2), restricted to the owner. One row per request:

| Field | Content |
|---|---|
| Request number | LE-YYYY-NNN |
| Received | Date, time, channel |
| From | The authority; the officer's or official's name, role and work contact details |
| Checked | How we checked who was asking, and when |
| Basis | The legal basis cited, and the one we relied on |
| Asked for | What was asked, and any deadline |
| Decision | Disclose in full, in part, or not; why |
| Disclosed | What, when, how, to whom |
| Hold | Hold number, if set |
| User told | Yes or no, and why |
| Emergency | Whether section 5 applied; the record (L6) |
| Closed | Date; the date the row is due for deletion (24 months after closing, longer under a hold) |

## 14. Templates

Every letter ends with this signature (company particulars, DOC-7):

> Resbite Ltd · Registered in England and Wales, company number 12450334 · Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom · VAT number: [[OWNER: VAT number, or delete if not VAT-registered]] · privacy@resbite.com

### L1. Acknowledgement to an authority

> We received your request [reference] on [date]. We are dealing with it and will reply by [date]. [We have taken steps to preserve the information you described.] Please send any further correspondence to privacy@resbite.com, quoting [LE-number].

### L2. We need more before we can answer

> Before we can consider your request [reference], we need: [the legal basis you rely on / confirmation that the request is authorised by [the authorising officer] / a narrower description of the information you need, limited to [the person, the period, the kind of data]]. For the content of communications, photos or other users' information, we will need a court order or warrant unless there is an immediate risk to life. We have preserved the information you described in the meantime.

### L3. Disclosure cover note

> In response to your request [reference] dated [date], made under [the basis], we enclose [a short description of the data, for example "the account details and sign-in records for the account linked to the phone number you gave, for the period [dates]"]. We have disclosed only what the request needs. This is personal data: please handle it accordingly and use it only for the purpose stated in your request. The file is encrypted; the password follows separately.

### L4. Refusal, or a court order is needed

> We have considered your request [reference]. We are not able to disclose the information without [a court order / the consent of the person concerned], because [the reason, for example "it is the content of private messages" or "it identifies a person who reported a concern to us"]. We have preserved the information for [period] in case you obtain one.

### L5. Preservation confirmation

> We confirm that from [date and time] we have preserved the information described in your [request / notice] [reference], and will keep it until [date / you tell us it is no longer needed]. Information held only in short-lived system logs was exported on [date] where it still existed.

### L6. Emergency disclosure record (internal, in the log)

> Date and time of the call or finding: [ ]. Who asked: [officer, force, control room reference]. How checked: [callback route]. The danger: [one line]. What was disclosed: [ ]. When: [ ]. By whom (role): [ ]. Basis: vital interests / recognised legitimate interest (emergency, safeguarding), with the crime exemption. Why it could not wait for a written request: [ ]. Hold set: [hold number]. Written request received: [date].

## 15. What must be built for this procedure to work in full

| Item | What this procedure needs from it |
|---|---|
| C2 | The legal hold in account deletion: the request accepted, erasure of held records waiting |
| C3 | Retention jobs, including the closed-report purge and the photo clean-up, that skip held records |
| C6 | The hold script (set, lift, list); "hide and preserve" removals; the export script for one account |
| D1, A4 | /support naming privacy@resbite.com as the address for authorities (already in `docs/legal/support.md`) |
| F2 | Resbite Ltd registered on the NCA's CSEA Industry Reporting Portal |
| F17 | The request log and hold register outside the repo |
| A13, A14 | The records Ofcom is most likely to ask for |
| A24 | The backup moderator's signed instructions, including the emergency disclosure rule |

## 16. Sources

- DPA 2018 Schedule 2, Part 1, paras 2 and 5 (text not re-read): https://www.legislation.gov.uk/ukpga/2018/12/schedule/2
- UK GDPR Art 6(1)(d), 6(1)(ea) and Annex 1, recognised legitimate interests (Data (Use and Access) Act 2025): ICO guidance (x): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/recognised-legitimate-interest/
- ICO, Sharing personal data with law enforcement authorities (x): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/sharing-personal-data-with-law-enforcement-authorities/
- Online Safety Act 2023 ss.100 to 103 and 109 (search extracts; legislation.gov.uk refused automated reads): https://www.legislation.gov.uk/ukpga/2023/50/part/7/chapter/4
- Data (Use and Access) Act 2025 s.124 and the Commencement No. 2 Regulations, S.I. 2025/982 (search extracts): https://www.legislation.gov.uk/uksi/2025/982/made ; Ofcom, preserving information about a child's online activity following a coroner's request (x): https://www.ofcom.org.uk/online-safety/protecting-children/preserving-information-about-a-childs-online-activity-following-a-coroners-request
- [OFCOM-DPN] Ofcom information-gathering guidance, data preservation notices (draft, December 2025; current status UNVERIFIED) (x): https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-1-10-weeks/consultation-on-data-preservation-notices/online-safety-information-gathering-guidance-dec2025.pdf?v=409377
- National Crime Agency, "The Online Safety Act and the Role of the National Crime Agency", version 1.0, 7 April 2026 (read directly): https://www.nationalcrimeagency.gov.uk/who-we-are/publications/802-the-online-safety-act-and-the-role-of-the-nca/file
- Online Safety (CSEA Content Reporting by Regulated User-to-User Service Providers) Regulations 2026, S.I. 2026/268 (not read; retention periods from secondary sources, UNVERIFIED): https://www.legislation.gov.uk/uksi/2026/268/contents/made
- Investigatory Powers Act 2016 (not read; its application to Resbite is UNVERIFIED): https://www.legislation.gov.uk/ukpga/2016/25/contents

(x) means read only through search-engine extracts, because the site refused automated reads.
