# Team access: written instructions and confidentiality agreement for the backup moderator

| | |
|---|---|
| **Owner** | The owner, for Resbite Ltd (the controller) |
| **Version** | 1.0 — draft for solicitor review (decision D-12), not yet in force |
| **Date** | 17 November 2026 |
| **In force from** | [[OWNER: effective date — proposed: the day the backup moderator signs, before any access is given]] |
| **Next review** | 17 May 2027 (six months), with the access review (F16), and whenever the backup's access changes |
| **Purpose** | The template the backup moderator signs before getting any access: what they may see and do, MFA, no copies, incidents, and offboarding. |

This is an internal record (gap analysis item A24; rows PRV-17 and UGC-5). It holds no personal data. **The signed copy, with the backup moderator's name, is kept outside the repo.** The repo records only that a backup is named, and the date, never who (the rule in `qa/chat-release/README.md` for R-Q4). A UK solicitor reviews this template before it is used (decision D-12).

**Why it is needed.** Anyone acting under Resbite Ltd's authority who has access to personal data may process it only on Resbite Ltd's instructions (UK GDPR Art 29), and admin access must be secured (Art 32). On Supabase's Pro plan, the lowest role that can run the moderation scripts is **Developer, which can read every table**: every chat, phone number and report (PRV-17; [SB-ACCESS]). These instructions, MFA and the access review are what limit that access. The DPIA (A9) records the risk; the Team plan's read-only and project-scoped roles are the later fix.

**Employee, worker or contractor?** The template fits a person who works under Resbite Ltd's direct authority, paid or unpaid (Art 29). If the backup is supplied by another business, that business is a processor and needs a processor contract (Art 28) instead, with these instructions as its schedule. The solicitor confirms which applies.

**What it describes.** Resbite at version 1.0, after workstreams B, C and D of the gap analysis are built. A step that is not possible yet carries **[needs X]**. Section 9 lists them.

**Companion records in this folder.** `moderation-standard.md` (A15), `breach-response.md` (A17), `law-enforcement-requests.md` (A22), `records-of-processing.md` (A8, section 14: MFA on every admin account, the six-monthly access review, offboarding).

## Placeholders to fill

1. [[OWNER: effective date — proposed: the day the backup moderator signs, before any access is given]]
2. [[OWNER: the backup moderator's identity — recorded only in the signed team access agreement kept outside the repo; the repo records only that a backup is named, and the date — proposed: one named person at the Supabase Developer role with MFA, named before the 1.0 submission]]
3. [[OWNER: whether the backup moderator is an employee, an officer, an unpaid helper or a contractor — proposed: an individual under Resbite Ltd's direct authority; a contractor, or a business supplying a moderator, also needs a processor contract]]
4. [[OWNER: tool that holds the moderation, request, complaint, breach and law-enforcement logs — proposed: one access-controlled spreadsheet in the mailbox provider's business workspace, under the same data processing agreement]]
5. [[OWNER: which delegated authorities in section 3.8 the backup is given — proposed: all four]]
6. [[OWNER: VAT number, or delete if not VAT-registered]] (in the agreement's party details, section 4)

---

## 1. Before any access is given

The owner completes every step, in this order, and records the date of each in the access register (section 5).

1. The backup has read `moderation-standard.md`, `breach-response.md` and this document, and has had the chance to ask questions.
2. The backup signs the written instructions (section 3) and the confidentiality agreement (section 4). The owner countersigns. The signed copy goes into the access register's folder in the log tool, outside the repo.
3. The backup turns on MFA (an authenticator app or a security key, not SMS) on every account in section 2, and shows the owner it is on.
4. The backup's own Resbite account uses an email sign-in (email and password, Apple or Google), because `supabase/ops/moderators.sql` finds moderators by account email.
5. The owner rotates the push worker secret if it has been in `net.http_request_queue` (`breach-response.md` section 11), so the backup never sees a secret in use before their access.
6. The owner gives access (section 2), at the lowest role that works **[needs C5]**:
   - runs `supabase/ops/moderators.sql` with every moderator's email, in a private temporary copy of the script that is deleted after the run;
   - invites the backup to the Supabase organisation at the Developer role;
   - gives access to the support inbox and to the moderation log in the log tool;
   - adds the backup as a user on the NCA's CSEA Industry Reporting Portal, if Resbite Ltd is registered (`moderation-standard.md` section 9).
7. A first daily read together: the owner and the backup run `supabase/ops/open-reports.sql` and walk through one closed example.
8. The repo records that a backup is named, and the date, without their name, number or account id (`qa/chat-release/README.md`, R-Q4; `records-of-processing.md` section 16).

## 2. The access the backup gets

| Account | Role | Why | MFA |
|---|---|---|---|
| Supabase organisation and project | Developer (the lowest role on Pro that can run the scripts) | Run the moderation scripts in the SQL editor; ban or unban an account in the Auth dashboard | Required |
| Support inbox (support@resbite.com) | Shared access | Read safety reports, appeals and legal complaints; send the notice templates | Required |
| The moderation log, in the log tool (placeholder 4) | Edit the moderation log only | Record cases and handovers | Required |
| Their own Resbite account, listed in `private.moderators` | An ordinary account | Receive "A new report is waiting." | Their own choice |
| NCA CSEA Industry Reporting Portal | User | Make a CSEA report without waiting for the owner | Required by the NCA (authenticator app) |

**Not given:** the privacy inbox; the request, breach and law-enforcement logs; Vercel, Expo and EAS, Apple, Google Cloud, Resend, GitHub, the SMS provider, the CAPTCHA vendor, the domain registrar and DNS. Text-message notices wait for the owner.

## 3. Written instructions (template)

> **Resbite Ltd — written instructions for the backup moderator**
>
> These instructions are given by Resbite Ltd (company number 12450334) under UK GDPR Article 29. They tell you what you may and may not do with the personal data you can reach through your access. Follow them every time. If something is not covered, ask the owner before acting.

### 3.1 Your role

You cover Resbite's moderation when the owner is away, ill or without a connection, and you report anything that looks like a security problem. You work under the moderation standard (`moderation-standard.md`), which these instructions are part of. You act for Resbite Ltd, not for yourself.

### 3.2 What you may see

Only what the task in front of you needs:
- the output of `supabase/ops/open-reports.sql`: open reports, with the reporter's words, the frozen copy of the reported message, names, the resbite and its date, and the last seven days of blocks;
- for a report that names a chat, the messages around the reported one, and nothing else in that chat;
- for an affected person's report or an intimate image report, the specific content it describes;
- in the Auth dashboard, the record of an account you are acting on, to ban or unban it or to find its email for a notice;
- the safety messages in the support inbox;
- the moderation log.

You may not look at anything else, even though your Supabase role would let you. In particular: do not browse tables, chats, profiles, phone numbers or reports; do not look up anyone you know, or anyone for a reason of your own.

### 3.3 What you may do

| You may | With |
|---|---|
| Read the queue every day you are on cover | `supabase/ops/open-reports.sql` |
| Remove a reported message | `supabase/ops/remove-reported-message.sql` |
| Suspend the person a report is about, and undo a mistaken suspension | `supabase/ops/suspend-account.sql` and the undo at its end |
| Close a report | `supabase/ops/close-report.sql`, with a note that holds only the case number |
| Suspend by account id; remove a photo, title, description, notes or cover | The C6 scripts **[needs C6]** |
| Ban or unban an account in Auth | The Auth dashboard, only in the cases the moderation standard lists (its section 8.2) |
| Send the notice templates | The support inbox, by email |
| Record cases and handovers | The moderation log |
| Make a CSEA report to the NCA | The NCA's portal, as a registered user |
| Escalate | A phone call or message to the owner, never with material attached |

Run only these scripts. Do not write or run any other query, and never one that changes data. Put ids and emails only into the SQL editor's copy of a script; then delete that saved snippet, or clear the value.

### 3.4 What you must never do

- Download, export, screenshot, photograph, print, copy or forward any personal data or reported material, by any channel, to anyone, including yourself.
- Paste anything from Resbite into another tool: AI assistants, translators, search engines, chat apps, personal notes or documents.
- Use a personal email address or phone for Resbite work, or contact a user from a personal account.
- Discuss a case with anyone except the owner and, through the owner, the solicitor.
- Act on a case that involves you, someone you know, or a resbite you are part of.
- Change any setting, function, key, policy, schema, script or anyone's access.
- Delete anything outside the moderation scripts, or empty the log.
- Keep anything after the case is done.

### 3.5 Security

- **MFA** on every account in section 2, with an authenticator app or a security key, not SMS. Keep your recovery codes offline.
- **Passwords:** a different strong password for each account, in a password manager.
- **Your device:** a computer and phone you alone use, with the latest system updates, a screen lock, and full-disk encryption on. No shared or public computers. Sign out of the consoles when you finish a session.
- **Networks:** avoid public Wi-Fi for this work; if you must use it, use a trusted VPN.
- **Lost or stolen device:** tell the owner at once, and sign out of every console from another device if you can.

### 3.6 Child sexual abuse material

If you come across it, follow `moderation-standard.md` section 9 exactly. Never copy it or send it anywhere, even to the owner or the police. The only route is the NCA's portal, and 999 if a child is in danger now. You may stop at any point and hand over to the owner.

### 3.7 Incidents

If you think personal data may have been lost, seen by the wrong person, changed, or reached by someone who should not have it, tell the owner **at once** by phone or message, without attaching personal data (`breach-response.md` sections 2 and 3). Do not investigate beyond your own access, and do not delete anything.

### 3.8 Delegated authorities

Resbite Ltd gives you these authorities (placeholder 5). Use them only as written, and tell the owner as soon as you can after using one.

1. **Initial breach report.** If you have reported a suspected breach and the owner cannot be reached within 24 hours, and the 72-hour deadline is at risk, you may file an initial report with the Information Commission (ICO) through ico.org.uk with what is known (`breach-response.md` section 6).
2. **Emergency disclosure.** If someone's life is at risk now and the owner cannot be reached within minutes, you may give the police the minimum information needed to prevent the harm, after checking the caller (`law-enforcement-requests.md` section 5), and record it within 24 hours.
3. **Legal hold.** You may set a legal hold in a CSEA or intimate image case (`law-enforcement-requests.md` section 11) **[needs C6]**.
4. **Auth ban.** You may ban an account in Auth in the cases `moderation-standard.md` section 8.2 lists.

### 3.9 Cover and availability

When you are on cover, read the queue and the support inbox every day, including weekends, and act within the times in `moderation-standard.md` section 3. Read the owner's handover note before you start, and write one when you finish.

### 3.10 Your wellbeing

Moderation can mean reading distressing content. You can step away from a case at any time and hand it to the owner. Tell the owner if anything you have seen stays with you; Resbite Ltd will help you find support.

### 3.11 Changes and ending

The owner may change these instructions; you will be told and asked to confirm. Your access is reviewed every six months and ends when you stop being the backup moderator, or at once if these instructions are broken. Section 7 is what happens then.

> **I have read and will follow these instructions.**
>
> Name: ______________________ Signature: ______________________ Date: __________
>
> **For Resbite Ltd** (the owner): ______________________ Signature: ______________________ Date: __________

## 4. Confidentiality agreement (template)

> **CONFIDENTIALITY AGREEMENT**
>
> **Date:** __________
>
> **Parties**
> 1. **Resbite Ltd**, a private limited company registered in England and Wales with company number 12450334, whose registered office is at 86-90 Paul Street, London EC2A 4NE, United Kingdom (VAT number: [[OWNER: VAT number, or delete if not VAT-registered]]) ("**Resbite**").
> 2. **[Full name]** of [address] ("**you**").
>
> **Background.** Resbite runs the Resbite app and the link.resbite.com website. You will act as Resbite's backup moderator, with access to personal data about Resbite's users and other people, under Resbite's written instructions dated [date] ("**the Instructions**").
>
> **1. Confidential Information** means all information you obtain through your role, in any form, that is not public, including: any personal data (names, phone numbers, email addresses, messages, photos, plans, meeting places, reports, blocks, account records); reported material; the content of the moderation log, the support inbox and any case; and Resbite's systems, keys and security arrangements.
>
> **2. What you agree to do.** You will:
> (a) use Confidential Information only to carry out your role, and only as the Instructions allow;
> (b) not disclose it to anyone, except to Resbite's owner or as clause 3 allows;
> (c) not copy, download, photograph, record, print or forward it, or put it into any other tool or service, except where the Instructions expressly allow;
> (d) keep it secure as the Instructions require, including multi-factor authentication on every account you use for Resbite;
> (e) tell Resbite at once if you know or suspect that Confidential Information has been lost, misused or disclosed without permission.
>
> **3. When you may disclose.** Nothing in this agreement stops you:
> (a) disclosing information where the law requires it, provided that, where the law allows, you tell Resbite first;
> (b) making a protected disclosure (whistleblowing) under the Employment Rights Act 1996;
> (c) reporting a crime, or suspected crime, to the police, or raising a concern with a regulator such as the Information Commission (ICO) or Ofcom.
>
> **4. Data protection.** You will process personal data only on Resbite's instructions (UK GDPR Article 29). You understand that knowingly or recklessly obtaining, disclosing or keeping personal data without Resbite's consent can be a criminal offence under section 170 of the Data Protection Act 2018.
>
> **5. When your role ends**, or whenever Resbite asks, you will delete every copy of Confidential Information you hold, in any form, and confirm in writing that you have done so (the form in section 7 of Resbite's team access record). You will hand any open case to Resbite.
>
> **6. How long it lasts.** This agreement starts on the date above. Your duties under it continue after your role ends, without time limit for personal data and for as long as other Confidential Information is not public.
>
> **7. If this agreement is broken**, Resbite may end your access at once and may seek any remedy the law allows, including an injunction.
>
> **8. General.** This agreement and the Instructions are the whole agreement between us about confidentiality. If a court finds part of it unenforceable, the rest continues. Only a written change signed by both of us changes it. It is governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.
>
> **Signed** by [full name]: ______________________ Date: __________
>
> **Signed for Resbite Ltd** by [name], [position]: ______________________ Date: __________

**For the solicitor.** If the backup is unpaid, there may be no consideration for this agreement; the solicitor decides whether it should be executed as a deed, with a witness (open point). If the backup is an employee, check how this fits their contract of employment.

## 5. The access register

Kept outside the repo, in the log tool's access folder, restricted to the owner. One row per person with admin access, the owner included:

| Field | Content |
|---|---|
| Person | Name (only here) |
| Role | Owner, backup moderator |
| Signed | Dates the instructions and the confidentiality agreement were signed; where the signed copy is |
| Accounts | Each account in section 2 (or, for the owner, `records-of-processing.md` section 14.3), the role held, and the date given |
| MFA | Confirmed on each account, and the date checked |
| Delegated authorities | Which of section 3.8 were given |
| Reviews | Date and outcome of each six-monthly review |
| Ended | Date access ended; date of the deletion confirmation |

## 6. The six-monthly access review

Every six months from the day the backup first gets access, the owner follows `records-of-processing.md` section 14.4: who holds each account and at which role; remove what is not needed; MFA on everywhere; the moderator list in `private.moderators` matches the rota (`supabase/ops/moderators.sql`); a signed, current A24 for everyone with access; no shared credential used by someone who has left. The owner also reads the Supabase organisation's audit log for the backup's activity, if the plan provides one, and checks it fits the moderation log. Record the date and outcome in the access register, and in the repo by role only.

## 7. Offboarding

On the day the backup's access ends, for any reason:

1. Remove them from the Supabase organisation.
2. Run `supabase/ops/moderators.sql` with the remaining moderators' emails only, in a private temporary copy.
3. Remove their access to the support inbox and the log tool.
4. Remove them as a user on the NCA's portal.
5. Rotate every secret they could have seen with the Developer role: the Supabase secret key, the worker secrets, and any other key shown in the project (`breach-response.md` section 4.2; `records-of-processing.md` section 14.5).
6. End their sessions on every service.
7. Take over their open cases and holds, from their handover note and the moderation log.
8. Get the signed deletion confirmation below.
9. Record the date in the access register, and in the repo by role only.
10. Remind them in writing that the confidentiality agreement continues.

> **Confirmation of deletion**
>
> I confirm that I hold no copy of any information I obtained as Resbite's backup moderator, in any form or place, including devices, email, notes, files and cloud storage, and that I have handed every open case to Resbite. I understand that my confidentiality duties continue.
>
> Name: ______________________ Signature: ______________________ Date: __________

If access ends because the instructions were broken, the owner first preserves the evidence (the Supabase audit log, the moderation log, the inbox), then follows `breach-response.md`, then the steps above.

## 8. MFA for everyone with admin access

This document covers the backup moderator. The same MFA rule applies to the owner on every account that reaches personal data or controls the service: Supabase, Vercel, Expo and EAS, Apple Developer and App Store Connect, Google Cloud, Resend, GitHub, the SMS provider, the CAPTCHA vendor, the domain registrar and DNS, the inboxes, the log tool and the NCA's portal. The list, with who holds each, is `records-of-processing.md` section 14.3 **[needs F16]**.

## 9. What must be built for this record to work in full

| Item | What this record needs from it |
|---|---|
| C5 | The backup added with `moderators.sql`, and the Supabase invitation at Developer, with MFA |
| C6 | The suspend-by-id, removal and legal hold scripts the instructions allow |
| F1 | The support inbox, with shared access and MFA |
| F2 | The rota with the named backup; Resbite Ltd registered on the NCA's portal |
| F16 | MFA on every admin account; the six-monthly review; offboarding |
| A9 | The DPIA's record that the Developer role can read every table |
| A13 | The named accountable individual (the owner) |

## 10. Sources

- UK GDPR Arts 28, 29 and 32 (text not re-read): https://www.legislation.gov.uk/eur/2016/679/article/29 ; https://www.legislation.gov.uk/eur/2016/679/article/32
- DPA 2018 s.170, unlawful obtaining of personal data: https://www.legislation.gov.uk/ukpga/2018/12/section/170
- Employment Rights Act 1996 s.43J, protected disclosures: https://www.legislation.gov.uk/ukpga/1996/18/section/43J
- [SB-ACCESS] Supabase, access control and roles: https://supabase.com/docs/guides/platform/access-control
- National Crime Agency, "How to register your organisation for the Child Sexual Exploitation and Abuse Industry Reporting Portal", version 1.0, 7 April 2026 (read directly; users need an authenticator app): https://www.nationalcrimeagency.gov.uk/who-we-are/publications/803-how-to-register-your-organisation-for-the-child-sexual-exploitation-and-abuse-industry-reporting-portal/file
