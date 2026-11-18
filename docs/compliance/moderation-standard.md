# Moderation and takedown standard

| | |
|---|---|
| **Owner** | The owner, for Resbite Ltd. The owner is also the named accountable individual for Online Safety duties (Ofcom Code measure ICU A2, decision D-6) |
| **Version** | 1.0 — draft for solicitor review (decision D-12), not yet in force |
| **Date** | 17 November 2026 |
| **In force from** | [[OWNER: effective date — proposed: the day version 1.0 is released on the App Store]] |
| **Next review** | When the backup moderator is named, then no later than 17 November 2027, and before any significant change to the app (F15) |
| **Purpose** | How Resbite reads reports, decides, acts within 24 hours (48 hours at most for intimate images), and records what it did. |

This is an internal procedure (gap analysis item A15; rows UGC-5 and UGC-7 to UGC-14). It holds no personal data: people appear only by role ("the owner", "the backup moderator"). A UK solicitor reviews it with the public documents before launch (decision D-12). It is written to be complete and usable as it stands.

**What it describes.** Resbite at version 1.0, after workstreams B, C and D of the gap analysis are built, using the owner's answers and the rulings of 17 November 2026 (AS-D1 to AS-D8 and AS-R1 to AS-R9 in `knowledge-base/08-decisions.md`) and otherwise the recommended default for every owner decision D-3 to D-25. A step that is not possible yet carries **[needs X]**, naming the gap analysis item that makes it possible. Section 23 lists them.

**References.** "The gap analysis" is `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`. Scripts are in `supabase/ops/`. The release runbook's section "The reports queue" (`qa/chat-release/README.md`) is the step-by-step for the scripts; this standard sets the rules and times, and wins where the two differ. Companion records in this folder: `team-access.md` (A24), `law-enforcement-requests.md` (A22), `data-requests.md` (A16), `breach-response.md` (A17), `records-of-processing.md` (A8), `retention-schedule.md` (A12) and `osa-illegal-content-risk-assessment.md` (A13).

## Placeholders to fill

1. [[OWNER: effective date — proposed: the day version 1.0 is released on the App Store]]
2. [[OWNER: the backup moderator's identity — the owner names one backup (decision AS-D6); recorded only in the signed team access agreement kept outside the repo; the repo records only that a backup is named, and the date — proposed: at the Supabase Developer role with MFA, named before the 1.0 submission]]
3. [[OWNER: tool that holds the moderation, request, complaint, breach and law-enforcement logs — proposed: one access-controlled spreadsheet in the mailbox provider's business workspace, under the same data processing agreement]]
4. [[OWNER: confirm Resbite Ltd is registered on the NCA's CSEA Industry Reporting Portal, and the date — proposed: register before submission; the NCA reviews registrations only Monday to Friday, 07:00 to 17:00]]
5. [[OWNER: VAT number, or delete if not VAT-registered]] (in the signature of every notice, section 19)

---

## 1. What this standard covers

**Content.** Everything people post that others can see:
- chat messages and announcements;
- display names and profile photos;
- a resbite's title, description, cover photo and cover description, its note to guests, its meeting place and its meeting details.

**Ways a concern reaches us.**

| Channel | Who uses it | Lands in |
|---|---|---|
| Report in the app (a message or a person) | Users | `private.reports`, with a push to each moderator: "A new report is waiting." |
| Email to support@resbite.com | Anyone, including people who are not users, removed guests and third parties | The support inbox **[needs F1]** |
| The contact form on https://link.resbite.com/support | Anyone, including affected people who are not users and people reporting an intimate image of themselves | The support inbox **[needs D1, F1]** |
| Police, the NCA, Ofcom, a court or a coroner | Authorities, at privacy@resbite.com (ruling AS-R7) | Follow `law-enforcement-requests.md` (A22) |

The blocked-terms filter refuses a chat message or announcement holding a listed term before it is stored (`supabase/ops/blocked-terms.sql`). At 1.0 it also checks titles, descriptions, notes to guests, meeting details and display names **[needs C7]**. The filter is not moderation: nobody reads what it refuses, and it keeps no copy.

**Out of scope.** Data protection requests (follow `data-requests.md`), data protection complaints (follow the complaints procedure, A5), breaches (follow `breach-response.md`).

## 2. Who moderates

| Role | What they do |
|---|---|
| **The owner** | Reads the queue every day. Decides and acts. Handles anything the backup escalates. Owns this standard. The named accountable individual (ICU A2). |
| **The backup moderator** | Reads the queue every day while the owner is away, and acts under this standard and the written instructions in `team-access.md`. The owner names them (decision AS-D6), on a signed A24, before any access **[needs A24, C5]**. |
| **The solicitor** | Advises on legal complaints, court orders, police requests and anything unclear in law. Never receives reported material. |

**Conflicts.** If a report involves you, someone you know personally, or a resbite you are part of, hand it to the other moderator and do not open it.

**Two moderators from the start.** The owner names the backup before the 1.0 submission (decision AS-D6), and the house rule R-Q4 keeps that release-blocking. The review notes' promise of action within 24 hours rests on the two of them (UGC-5, CON-4).

## 3. Time standards

All times are UK time and run every day, weekends and bank holidays included, unless the row says otherwise.

| What | Standard | Clock starts |
|---|---|---|
| Read the queue | At least once every day, whether or not a push arrived | — |
| A push "A new report is waiting." | Look within a few hours while you are awake | The push |
| **Any report** | **Act within 24 hours** | The report's `created_at` (app) or the email's arrival time (inbox) |
| Child sexual exploitation or abuse (section 9) | On sight: 999 first if a child is in danger now; the NCA report the same day | When you see it |
| Threat to someone's life or safety (section 8.3) | On sight: 999 first | When you see it |
| **Intimate image reports** (section 10) | As soon as you can, and **never later than 48 hours** | Arrival of the report |
| Defamation notice (section 16.1) | Contact the poster, or remove, within 48 hours, **not counting** Saturdays, Sundays, Good Friday, Christmas Day or bank holidays in England and Wales | Arrival of the notice |
| Appeal (section 17) | Acknowledge within 2 working days; decide within 10 working days | Arrival of the appeal |

**Why these times.** Apple asks for "timely responses to concerns" ([ARG 1.2]); the 24-hour figure comes only from rejection letters quoted on Apple's forums (UNVERIFIED, gap analysis section 7, question 1). The draft review notes promise 24 hours (`qa/chat-release/app-store-review-notes.md:33`). The Online Safety Act needs swift takedown once we are aware of illegal content (s.10; Ofcom Code measure ICU C2 (x)). The 48-hour intimate image duty is OSA s.20A, inserted by the Crime and Policing Act 2026 s.100; its commencement date is UNVERIFIED, and we apply it from launch (decision D-21). The appeal times match the public complaints and appeals procedure (A5, on the support page) and the Terms (section 11.3); if they ever differ, A5 wins.

**What reporters are told.** The in-app report thanks says "We review reports every day." (ruling AS-R9, for Ofcom Code measure ICU D4) **[needs B7]**. The support inbox's first reply gives the same time (A5).

**A missed standard is an incident.** Record it in the moderation log with the reason, and count it for the yearly review (section 22).

## 4. The daily routine

Do this once every day. It takes a few minutes on a quiet day.

1. **Run `supabase/ops/open-reports.sql`** in the hosted project's SQL editor. It is read-only; there is nothing to edit. It lists:
   - `report`: every open report, oldest first, with the reason, the reporter's words (`details`), the reported message's words as they were when reported (`frozen_body`), who reported, who was reported, and the resbite and its date;
   - `block`: every block of the last 7 days;
   - `due`: one row when closed reports are due for deletion.
2. **Check the support inbox** for reports, intimate image reports, appeals, legal complaints and messages from authorities. Do this every day, weekends included, because the 24-hour and 48-hour clocks run from arrival.
3. **Triage.** Deal first with every report whose reason is Child safety, Intimate image shared without consent or Illegal or dangerous, whatever its age; then the oldest of the rest **[needs B7, C7]**. Until `open-reports.sql` sorts those reasons first, scan the whole list before starting **[needs C7]**.
4. **Decide each report** with the rules in section 8 and act with the tools in section 7.
5. **Close each report** with `supabase/ops/close-report.sql`: status `reviewed` when nothing was done, `actioned` when something was; action `none`, `message_removed`, `account_suspended` or `both`; a short note with the case number from the moderation log and no name, number or email. Do not close a report while a CSEA, intimate image or police step is still open (sections 9 and 10).
6. **A `due` row:** until the retention jobs are live, run `supabase/ops/purge-closed-reports.sql`, unless a legal hold covers a closed report (section 18). The script does not know about holds. Once the C3 job replaces it, the job respects holds **[needs C3]**.
7. **Look at the blocks.** A block needs no action on its own: it is the blocker's choice. Three or more blocks of the same person within seven days are a signal. The owner may then read that person's own recent messages, never other people's, to check for abuse nobody reported, and records why in the moderation log. The owner may change the threshold.
8. **Update the moderation log** (section 20) for every case touched.
9. **Check the holds.** Look at the list of open legal holds in the log and review any that is due (section 18).

## 5. Absence and holiday cover

- **One moderator is on duty every day.** The owner is on duty by default. The backup is on duty whenever the owner is away, ill or without a connection.
- **Planned absence.** The owner tells the backup the dates at least a week ahead and writes a handover note in the moderation log: open cases, open holds, pending appeals, anything unusual. The backup confirms they have it.
- **Unplanned absence.** Whoever is unavailable tells the other as soon as they can. If the owner cannot be reached for 24 hours and has not handed over, the backup takes over.
- **Never both away.** The owner and the backup do not take leave at the same time. If both are unexpectedly unavailable, the first one back reads the queue at once, acts on the oldest and most serious reports first, and records the gap as a missed standard.
- **Escalation while on cover.** The backup handles everything this standard lets them handle, and escalates to the owner (by phone or message, never with the material attached) for: CSEA after the immediate steps; threats to life after calling 999; legal complaints and court orders; police or Ofcom contact; an appeal against the owner's own decision; suspending a host who has resbites coming up; and anything unclear.

## 6. Principles for every decision

- **The rules.** We judge content against the Terms of Use and their community rules (https://link.resbite.com/terms, A3) and the in-app chat rules ("Be kind. No harassment, hate, threats or spam. Messages that break these rules are removed, and people who break them can lose their account."). The Terms prohibit every kind of priority illegal content, so a moderator can act on a Terms breach without deciding whether a crime was committed (Ofcom Code measure ICU C1 (x)). Where an illegal content judgement is needed (for example, before reporting to the police or the NCA), use Ofcom's Illegal Content Judgements Guidance. We act on illegal content whether or not the Terms mention it.
- **Evidence.** Decide on what the report shows: the reporter's words, the frozen copy of the message, and the content itself. Read only what you need. Do not browse chats, profiles or tables. Open a chat's other messages only when a report names that chat and you need the context, and read only the messages around the reported one.
- **Reasonable grounds.** Act when, on what you can see, it is reasonable to think the content breaks the rules or the law. You do not need proof. When it is genuinely unclear, leave the content up, record why, and ask the owner.
- **Proportionate and consistent.** Use the lightest action that deals with the harm, and treat like cases alike. Record the reason, so the next case can follow it.
- **Freedom of expression and privacy.** Disagreement, bad language between friends, and opinions we dislike are not breaches on their own (OSA s.22). The team reads chats only through reports.
- **People are human decision-makers here.** Every moderation decision is made by a person. The blocked-terms filter is the only automated step, and it acts before anything is posted.
- **Never reveal the reporter.** No notice, reply or export tells the reported person who reported them.

## 7. The tools

Run every script in the hosted project's SQL editor, putting ids into the editor's copy only. The SQL editor keeps queries as saved snippets: after running a script with an id or email in it, delete that snippet or clear the value. Never paste an id, number or email into the repo, a runbook or a chat.

| Tool | What it does | Use it to |
|---|---|---|
| `supabase/ops/open-reports.sql` | Lists open reports, last week's blocks and due purges. Read-only | The daily read |
| `supabase/ops/remove-reported-message.sql` | Removes a reported message or announcement: no words, shown as "Message removed by Resbite". Run again, it changes nothing. The report keeps its frozen copy | Take down a reported message |
| `supabase/ops/suspend-account.sql` | Suspends the person a report is about: they can no longer read, write or get pushes. Records what it changed in `private.suspensions` and prints the account id for the undo. Its last lines hold the undo | Suspend from a report |
| `supabase/ops/close-report.sql` | Closes an open report with its status, action and note; starts its 180 days | Close every report |
| `supabase/ops/purge-closed-reports.sql` | Deletes reports closed more than 180 days ago | A `due` row, until C3 replaces it (section 4, step 6) |
| `supabase/ops/moderators.sql` | Sets who gets the "new report" push, by account email | Rota changes (owner only) |
| `supabase/ops/blocked-terms.sql` | Sets the blocked-terms list. Never save the terms in the file | Filter changes (owner only) |
| Auth dashboard → Users → ban | Stops the account signing in at all | Severe cases only (section 8.2) |
| Suspend by account id | As `suspend-account.sql`, for a case that came by email or has no report **[needs C6]** | Suspend without a report |
| Remove a profile photo | Takes a photo down. Must offer "hide and preserve" (detach without deleting the file) for CSEA and held cases **[needs C6]** | Photos |
| Remove a resbite's title, description, notes or cover | Takes the content down; same "hide and preserve" mode for covers **[needs C6]** | Resbite content |
| Set and lift a legal hold | Stops deletion and purge jobs destroying the held records **[needs C6, C2, C3]** | Section 18 |

**Gaps the C6 scripts should close** (open points for the owner): there is no script yet to reset a display name, to remove a chat message nobody reported (for example the rest of a CSEA thread), to cancel a suspended host's future resbites with the usual cancellation push, or to look up an account or resbite from an emailed description. Until they exist, the owner does these by hand in the SQL editor, read-only lookups only, written for the case and not saved, and the backup escalates.

`close-report.sql` accepts only the actions `none`, `message_removed`, `account_suspended` and `both`. For a photo or resbite removal, use the nearest value and say what was done in the note, until the action list grows **[needs C6 or C7]**.

## 8. Decision rules

### 8.1 The action ladder

| Level | Action | Typical use |
|---|---|---|
| 0 | No action. Close as `reviewed` | Nothing breaks the rules |
| 1 | Remove the content | A first, minor breach |
| 2 | Remove the content and suspend the account | Serious or repeated breaches; accounts that exist to spam or scam |
| 3 | Remove (or hide and preserve), suspend, ban in Auth, set a legal hold, report to the authority | CSEA, credible threats, terrorism, ban evasion; intimate image abuse where the owner decides, after the suspension, that a ban is needed |

A suspension lasts until we lift it. There are two ways to lift one:
- **A suspension made in error** (wrong account, wrong report): the undo at the end of `suspend-account.sql`. It deletes the suspension record, so a mistake leaves no record.
- **A suspension lifted after a successful appeal**, or after a person confirms they are 18 or over: the lift script that keeps the record and stores the date it was lifted, so the record can be kept for 12 months after (D-8 default; `retention-schedule.md`) **[needs C6]**. Until it exists, use the undo and note the lift in the moderation log.

There are no warnings in the app; where we can reach the person, a removal notice (template N3) serves as one.

### 8.2 Suspension and the Auth ban

- **Suspend without an Auth ban by default.** A suspended person can still sign in, sees the suspended screen with the support address, and can delete their account (decision D-19) **[needs B6, C2]**. That keeps their routes to appeal and to erasure open.
- **Add the Auth ban** (Auth dashboard → Users) **only** for level 3: CSEA, credible threats of violence, terrorism and proscribed organisations, ban evasion, and fraud or scam accounts; and intimate image abuse where the owner decides, after the suspension, that a ban is needed (the Terms, section 10.6, say "suspend it at once, and may then ban it"). A banned account cannot sign in, so it uses the request route for deletion (`data-requests.md`).
- This changes the release runbook, which bans every suspended account (`qa/chat-release/README.md`, "The reports queue", step 3). The owner confirms the change before launch.
- **Suspending a host.** A suspended host's future resbites stay in place, and a weekly group stops rolling, without a notice to the guests (decision D-20). If the suspension is for a safety reason (threats, violence, sexual offences) and the host has an in-person resbite coming up, escalate to the owner at once. The owner decides whether to cancel it by hand and whether the police need to know.

### 8.3 Rules per report reason

The app's labels and the values the server stores. The first three are added at 1.0 **[needs B7, C7]**.

| Reason (label → value) | What it usually covers | Decide | Usual action | Clock |
|---|---|---|---|---|
| **Child safety** → `child_safety` | Sexual content involving a child; an adult seeking contact with a child; an account that may belong to someone under 18 | Is it CSEA, or an under-18 account, or both? | CSEA: section 9. Under-18: section 12 | CSEA on sight; otherwise 24 h |
| **Intimate image shared without consent** → `intimate_image` | A nude, sexual or intimate photo of a person, as a profile photo or a cover, or linked from a message | Section 10 | Take down; suspend the uploader at once (the owner may then ban) | 48 h at most |
| **Illegal or dangerous** → `illegal` | Threats of violence; encouraging suicide or serious self-harm; terrorism; hate crime; fraud and scams; selling drugs or weapons; sharing someone's home address to harm them; arranging a crime at a meet-up | Is someone in danger now? If yes, 999 first (section 8.4) | Level 2 or 3; preserve where the police are likely to need it | Threats on sight; otherwise 24 h |
| **Harassment** → `harassment` | Abuse aimed at a person; bullying; unwanted sexual messages; hate aimed at a group | Context matters: a heated exchange between friends is not the same as targeting | First minor case: remove (level 1). Serious, sexual, hateful or repeated: level 2 | 24 h |
| **Spam** → `spam` | Repeated advertising; scam or phishing links; mass invitations | Is the account real? | Remove; level 2 for accounts that exist to spam. Fraud: treat as Illegal | 24 h |
| **Not appropriate** → `inappropriate` | Sexual content or nudity; graphic violence; an offensive name, photo or title | Would it break the Terms if a stranger saw it? | Remove; level 2 if sexual content was sent to people who did not want it, or if repeated | 24 h |
| **Something else** → `other` | Anything | Read the details and pick the real reason | As that reason | 24 h |

**Reports about a person rather than a message** carry no frozen copy. Look at what they said or did in the resbite named, their display name, profile photo, and any resbite they host that the report concerns.

**Reports that do not break any rule** are closed as `reviewed` with action `none`. The reporter can block the person.

### 8.4 Threats to life, and people in danger

If a report or message suggests someone is at risk of serious harm now (a threat to kill or hurt someone, a plan to harm a person at a meet-up, someone at risk of suicide), **call 999** and give the police what they need to act. Then act on the content, set a hold, and follow `law-enforcement-requests.md` for the emergency disclosure record. If someone is at risk of suicide, say so to the 999 operator. Never wait for the daily read.

## 9. Child sexual exploitation and abuse (CSEA)

UK providers of user-to-user services must report detected and unreported CSEA content on their service to the National Crime Agency (OSA s.66, in force for user-to-user services from 7 April 2026 with the Online Safety (CSEA Content Reporting by Regulated User-to-User Service Providers) Regulations 2026, S.I. 2026/268) [NCA-OSA]. The offences are those in OSA Schedule 6.

On Resbite, CSEA can appear as a profile photo or cover, as text (grooming, sexual messages to a child, offers of material), or as a link in a message. Chat carries text only.

**Do this, in this order.**

1. **Stop and do not copy.** Do not screenshot, download, save, print, forward or show it to anyone, by any channel, even to the owner or the police. Making or sending copies of indecent images of children is a serious crime even when meant to help. Look only at as much as you need to recognise it. **Never open a reported link that may lead to child sexual abuse material**: report the address as it appears in the message.
2. **Is a child in danger now?** If abuse is happening, or a meeting between an adult and a child is planned, **dial 999**. The NCA treats this as priority 1 and tells unregistered organisations to dial 999 first [NCA-REG].
3. **Preserve.** Set a legal hold on every account involved **[needs C6]** before any step that could delete something. Do not close the report.
4. **Take it down from view.**
   - A reported message: `remove-reported-message.sql`. The report keeps the frozen copy as the preserved record.
   - A photo or cover: the C6 removal script in "hide and preserve" mode, never a plain delete **[needs C6]**.
   - Other messages in the same thread that nobody reported: escalate to the owner (section 7 gaps).
5. **Suspend and ban** every account responsible: `suspend-account.sql` (or suspend by account id **[needs C6]**), then the Auth ban.
6. **Report to the NCA the same day** through the CSEA Industry Reporting Portal (CSEA-IRP), signed in as a registered user. Give the information the 2026 Regulations require; the portal marks the mandatory fields. Follow the portal's own instructions on whether and how content is submitted. Never send the material any other way. If the material is a link to another website, also report the address to the Internet Watch Foundation (iwf.org.uk).
   - Resbite Ltd must be registered before it needs the portal: the owner is the Organisation Administrator and adds the backup as a user. The NCA reviews registrations only in working hours [NCA-REG] (placeholder 4).
   - IP addresses are kept only briefly: `auth.sessions` until sign-out, platform logs for 7 days. Gather what the report needs at once.
7. **Tell the owner** by phone or message, without describing or attaching the material.
8. **Do not tell the suspected person why.** Send no reasons notice until the police or the NCA say it is safe. The suspended screen shows the support address. To the reporter, say only that we have acted (template N5).
9. **A child who uses Resbite.** If the victim appears to be a child with an account, suspend their access too, to protect them, and keep their data under the hold. Delete it under section 12 once the hold allows.
10. **Record** in the moderation log: times, the actions, the NCA reference. Never the material, and never a description beyond "CSEA (category)".
11. **Keep the held records** for as long as the 2026 Regulations require, or longer if the police or the NCA ask. Secondary sources say one year from the report for the content and user data, and five years for the report reference: UNVERIFIED, check S.I. 2026/268 (open point).
12. **Look after yourself.** Seeing this material is distressing. Stop as soon as the steps are done, and talk to the owner. Nobody should review more than necessary.

## 10. Intimate image reports: the 48-hour takedown

**What counts.** A report that a nude, sexual or otherwise intimate image of a person is on Resbite without their consent, made by or for the person shown (OSA s.20A, once in force; Apple's guideline 1.2 asks apps to "proactively prevent and remove" nonconsensual intimate imagery [ANEWS-1026]). On Resbite such an image can only be a profile photo or a cover, or a link in a message.

**We remove any intimate image in a profile photo or cover whoever reports it**, because the Terms forbid sexual content and nudity there (A3). So we never need to prove who is in the picture before taking it down.

**Routes.** The in-app reason "Intimate image shared without consent" **[needs B7, C7]**, and the web route on https://link.resbite.com/support for people who are not users **[needs D1]**. Email to support@resbite.com counts too.

**Steps, within 48 hours of the report, weekends included. Aim for the same day.**

1. Find the image. If the person shown may be under 18, go to section 9 instead.
2. Take it down with the C6 removal script **[needs C6]**, or `remove-reported-message.sql` for a link.
3. Suspend the uploader at once (decision D-21, ruling AS-R6; the Terms, section 10.6). The owner then decides whether to add the Auth ban (level 3), for example for a threat to share more images or a repeat.
4. **Keep or delete?** Delete the file once it is down, unless the person shown wants to report it to the police, or the police ask, or it is CSEA. In those cases hide and preserve it under a legal hold (section 18).
5. Reply to the person who reported it (template N6), with the outcome and where to get help: the Revenge Porn Helpline, and StopNCII.org for adults.
6. **Stop it reappearing.** The suspended uploader cannot post again. If the same or a substantially similar image appears from another account, treat that account as ban evasion (section 15) and take the image down within 48 hours of that report. We do not hash-match images for 1.0; the reasons are recorded in A13 (decision D-21) and reviewed yearly.
7. Record the time the report arrived and the time the image went down.

## 11. Reports from affected people who are not users

People who are not users can report illegal content and use the complaints procedure if they are **affected**: someone in the UK who is the subject of the content, a member of a group it targets, or the parent or carer of a child user (OSA s.20(2) and (5), s.21; UGC-9). For example: someone discussed or pictured in a chat, an invitee who only used the web page, or a parent whose child got past the 18+ tick.

- **Route.** support@resbite.com or the /support contact form **[needs F1, D1]**.
- **What we ask for.** What the content is and where (a name, a resbite title, a rough date, what it says or shows), and how they are connected to it. We do not ask for identity documents to take content down.
- **Finding it.** The owner finds the content from the description (section 7 gaps). The backup escalates unless it is an intimate image or CSEA case, where they act at once on whatever they can find.
- **Deciding.** The same rules and clocks as an in-app report: 24 hours, or 48 hours at most for an intimate image.
- **Replying.** Template N5. We tell them whether we acted, never the other user's personal data or the detail of what we did to their account.
- **If they want their own data**, follow `data-requests.md`. If they disagree with our decision, they can complain under A5.

## 12. Accounts that may belong to someone under 18

Resbite is 18+ only. The Terms say so and say how we enforce it (A3; LAW-37). We act on every report of an under-18 account in the same way.

**Reasonable grounds** include: the person says they are under 18; a credible report from a parent or carer; a school year or age stated in a chat or name. A young-looking photo is not enough on its own. Resbite no longer asks for a date of birth at 1.0 (decision D-9) **[needs B11, C9]**.

**Steps.**
1. If there is any sign of an adult seeking sexual contact with the child, follow section 9 first.
2. Suspend the account (no Auth ban, so the person can see the support address and delete the account themselves) **[needs B6, C2]**.
3. Write to the person (template N7) where we can reach them. Ask for no more than is proportionate: a statement that they are 18 or over, with a short explanation of the report. Do not ask for identity documents as a first step.
4. If they confirm they are 18 or over and nothing contradicts it, lift the suspension (section 8.1), and record why.
5. If they confirm they are under 18, or do not answer within 14 days, delete the account and its data with the owner-run deletion script, which runs the same lifecycle as the app, with the cancellations and the receipt (ruling AS-R3) **[needs C6]**, unless a legal hold applies.
6. Record the case, without the child's details, so A14's yearly review can count under-18 cases.

## 13. Proscribed organisations and terrorism

Ofcom's Code measure ICU H1 applies to all user-to-user services: remove an account where there are reasonable grounds to infer it is run by or for a proscribed organisation (UGC-13; [OFCOM-CODES] (x), check against the version in force).

**Indicators.** The account's name, photo, cover or resbites use the name, logo, flag or symbols of a group on the Home Office list "Proscribed terrorist groups or organisations" (gov.uk; the page address changes when the list is reissued, so search the title); content praises, supports or recruits for such a group; a resbite is organised to support it.

**Steps.**
1. If anyone is in danger now, dial 999.
2. Remove the content, suspend the account and ban it in Auth (level 3). Set a legal hold.
3. Report terrorist content to Counter Terrorism Policing through gov.uk/report-terrorism.
4. Anyone who learns information they know or believe might help prevent an act of terrorism must tell the police as soon as reasonably practicable (Terrorism Act 2000 s.38B).
5. Record the indicators you relied on.

## 14. Removal of other content types

The same rules apply to a display name, profile photo, title, description, note, meeting place or cover. Use the C6 removal scripts **[needs C6]**. For a display name there is no script yet: suspend if the name itself is the breach, and escalate to the owner (section 7 gaps).

## 15. Ban evasion

A suspended person can sign up again with another number, and nothing stops it technically (UGC-12; decision D-25).

- **Reasonable grounds** include: the same display name or photo as a suspended account; the same behaviour towards the same people; joining the same groups; a reporter who says it is the same person. Record which you relied on.
- **Action.** Suspend the new account too and ban it in Auth, citing evasion (template N1). Content that was the reason for the first suspension is removed again.
- **For 1.0** there is no technical block. Refusing re-registration from the same Apple or Google identity is a later option (D-25). Each case is counted for A13's yearly review.

## 16. Third-party legal complaints

Escalate every legal complaint to the owner. Do not argue the merits with the complainant. The hosting defence depends on acting quickly once we know (E-Commerce Regulations reg 19, UNVERIFIED in this draft).

### 16.1 Defamation (the section 5 process)

The website operators' defence in Defamation Act 2013 s.5 needs these steps, from the Defamation (Operators of Websites) Regulations 2013 as the Ministry of Justice guidance explains them [MOJ-DEF]. "48 hours" never counts Saturdays, Sundays, Good Friday, Christmas Day or bank holidays in England and Wales. Whether an app counts as a "website" for s.5 is a question for the solicitor; we follow the steps anyway.

1. **Check the notice.** It must give: the complainant's name and an email address; where the statement is; what it says and why it is defamatory of them; the meaning they give it; which parts they say are untrue or opinions without basis in fact; confirmation that they cannot identify the poster well enough to sue; and whether they consent to their name and email going to the poster.
2. **A defective notice:** within 48 hours, tell the complainant in writing that it does not meet the requirements, and list them (template N9c).
3. **A valid notice, and we can contact the poster** (by email, or a text message to their verified number **[needs C1]**): within 48 hours send the poster template N9b: a copy of the notice (without the complainant's name or address if they asked), and a deadline of midnight UK time at the end of the 5th day after the day we send it. Within the same 48 hours, tell the complainant we have received the notice and told the poster (N9a).
4. **We cannot contact the poster:** remove the statement within 48 hours of the notice, and tell the complainant it has been removed.
5. **The poster's answer:**
   - no answer by the deadline: remove within 48 hours after the deadline, and tell the complainant;
   - agrees to removal: remove within 48 hours, and tell the complainant;
   - wants it kept but gives no full name and postal address, or gives obviously false ones: remove within 48 hours, and tell the complainant;
   - wants it kept and gives a name and address: within 48 hours tell the complainant it stays, and pass on the details only if the poster consented. Without consent, we release them only under a court order.
6. **Reposting.** If the same poster reposts the same or substantially the same statement after two earlier notices about it, remove it within 48 hours of the new notice.

We may also simply remove a statement that breaks our own rules, at any point.

### 16.2 Copyright and other intellectual property

Typically a photo used without permission. On a notice that identifies the work, where it is on Resbite and why it infringes: remove it promptly (aim within 2 working days), and tell the poster where we can (template N3). If the poster says they have the right to use it, escalate to the owner, who takes advice. Suspend repeat infringers.

### 16.3 Privacy and personal information

A complaint that content discloses someone's private information (a home address shared to harm them, private photos, health details): treat it as an affected person's report (section 11), and remove promptly where publishing it is unjustified. A complaint about how Resbite itself handles data goes to `data-requests.md` or A5.

### 16.4 Court orders and injunctions

Comply by the deadline the order gives. Escalate to the owner at once; the owner takes advice and follows `law-enforcement-requests.md` for disclosure orders.

## 17. Appeals and complaints about moderation

Anyone whose content was removed or whose account was suspended can appeal, and anyone can complain about how we handled a report (OSA s.21; UGC-7). The complaints and appeals procedure (A5) is the public description; this section is how we run it.

- **Route.** support@resbite.com, or a reply to our notice **[needs F1]**.
- **Who decides.** Someone other than the person who made the decision, where possible: the owner reviews the backup's decisions and the backup reviews the owner's. The person who made the decision may not decide the appeal alone.
- **Times.** Acknowledge within 2 working days; decide within 10 working days; tell the person if it will take longer and why.
- **Outcomes** (template N8):
  - upheld: the decision stands, with the reason;
  - overturned: lift the suspension (section 8.1: the lift script, or the undo if the suspension was a plain mistake), and lift the Auth ban by hand. Removed messages cannot be restored (the words are gone); say so, and that they may post again within the rules.
- **Record** the appeal and its outcome. Overturned decisions feed the yearly review. If the same kind of mistake happens twice, change this standard so it does not happen again (Ofcom Code measure ICU D10 (x)).

## 18. Legal hold

A legal hold stops the account deletion and the purge jobs destroying records that the police, the NCA, Ofcom, a court or a claim may need. `law-enforcement-requests.md` (A22) is the full procedure; in short:

- **Set a hold** for: every CSEA case; an intimate image case where the person shown wants to go to the police; a threat or terrorism case; a police, NCA, Ofcom or court request; a claim. The owner sets holds; the backup may set one in a CSEA or intimate image case **[needs C6]**.
- **What it stops** at 1.0: the erasure part of an account deletion (the request is accepted; erasure of the held records waits) **[needs C2]**; the retention purges, including the closed-report purge and the 7-day orphan photo clean-up **[needs C3]**.
- **What it does not stop:** `purge-closed-reports.sql` run by hand (do not run it while a hold covers a closed report); a user deleting their own message; a host removing a message; backups and platform logs, which roll over after 7 days. Gather anything time-limited at once.
- **Review** each hold every three months and lift it when its reason ends.

## 19. Notices and templates

**When to send.** Send a notice when we suspend an account (N1 or N2), and when we remove content and can reach the poster (N3). Send the full statement of reasons (N4) on request or with an appeal outcome. Do not send one in a CSEA case, or where the police ask us not to (section 9).

**How.** By email from support@resbite.com where the account has a confirmed email. Otherwise by text message to the verified number, through Twilio (decision AS-D5) **[needs C1]**. If neither is possible, the suspended screen shows the support address **[needs B6]**. The Privacy Policy says we may text the verified number about a suspension, a request or a security problem (its section 3.1).

**Never** name the reporter, quote their words, or say anything that would identify them. Describe the content in neutral terms.

**Signature on every email** (company particulars, DOC-7):

> Resbite Ltd · Registered in England and Wales, company number 12450334 · Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom · VAT number: [[OWNER: VAT number, or delete if not VAT-registered]] · support@resbite.com

Square brackets mark the parts to fill in. Keep the rest as written.

### N1. Suspension notice (email)

> **Subject:** Your Resbite account has been suspended
>
> Hello,
>
> We have suspended your Resbite account. While it is suspended you cannot use the app, and you will not get notifications.
>
> **Why.** [One or two neutral sentences: what was posted or done, and where, for example "A message you sent in the chat for a resbite on [date]" or "Your profile photo".] This breaks [the rule, for example "our rule against harassment" or "our rule against sexual content in profile photos"] in our Terms of Use: https://link.resbite.com/terms
>
> **How we found out.** [A report from another user / Our own review / A report from someone affected by the content.] A person at Resbite reviewed it and made this decision.
>
> **What happens now.** The suspension lasts until we lift it. [If relevant: We have also removed the content.] [Omit for an Auth ban: You can still sign in to the app, where you can find our contact address and delete your account.] You can delete your account at any time: https://link.resbite.com/delete-account
>
> **If you think we got it wrong,** reply to this email and tell us why. Someone who did not make this decision will look at it. We aim to decide within 10 working days.
>
> Resbite
>
> [Signature]

### N2. Suspension notice (text message)

> Resbite: your account has been suspended for breaking our Terms. To find out why or to appeal, email support@resbite.com. Terms: link.resbite.com/terms

### N3. Content removed

> **Subject:** We removed something you posted on Resbite
>
> Hello,
>
> We removed [your message in the chat for a resbite on [date] / your profile photo / the title of your resbite "[title]"]. It breaks [the rule] in our Terms of Use: https://link.resbite.com/terms
>
> [A person at Resbite reviewed it after a report.] Your account is not suspended. If it happens again, we may suspend it.
>
> If you think we got it wrong, reply to this email and tell us why.
>
> Resbite
>
> [Signature]

### N4. Full statement of reasons

> **Subject:** Our decision about your Resbite account: the reasons
>
> **What we decided:** [removed / suspended / both], on [date].
>
> **The content:** [neutral description, without anything that identifies a reporter].
>
> **The rule:** [quote the rule from the Terms or chat rules, with the section].
>
> **Why it breaks the rule:** [two or three sentences].
>
> **How we found out:** [a user report / a report from someone affected / our own review / a legal notice]. The decision was made by a person, not automatically.
>
> **What you can do:** reply to appeal. [If an appeal was decided: the outcome is in our separate email.] You can also complain about how we handle complaints, as our complaints procedure explains: https://link.resbite.com/support
>
> Resbite
>
> [Signature]

### N5. Reply to someone who reported by email or the contact form

> **Subject:** Your report to Resbite
>
> Hello,
>
> Thank you for telling us. [We have looked at what you reported and taken action under our rules. / We have looked at what you reported and did not find that it breaks our rules, because [short reason].] For privacy reasons we cannot tell you what action we take about another person's account.
>
> If you disagree with our decision, reply to this email and tell us why.
>
> Resbite
>
> [Signature]

### N6. Intimate image report

> **Subject:** The image you reported
>
> Hello,
>
> Thank you for telling us. [We removed the image on [date and time] and suspended the account that posted it. / We could not find the image you described. Please reply with [what we need: the name shown, the resbite, the date].]
>
> If you want to report this to the police, tell us and we will keep a secure record for them. You can call 101, or 999 if you are in danger.
>
> Free, confidential help: the Revenge Porn Helpline, and StopNCII.org (for adults), which can help stop the image being shared on other services.
>
> Resbite
>
> [Signature]

### N7. Possible under-18 account

> **Subject:** Your Resbite account: please confirm your age
>
> Hello,
>
> Resbite is only for people aged 18 or over. We have been told this account may belong to someone younger, so we have suspended it for now.
>
> If you are 18 or over, reply to this email within 14 days to tell us, with a short explanation. We will then look again. If you are under 18, or we do not hear from you within 14 days, we will delete the account and its data.
>
> You can also delete the account yourself in the app: Profile → Data & privacy → Delete account.
>
> Resbite
>
> [Signature]

### N8. Appeal outcome

> **Subject:** Your appeal to Resbite
>
> Hello,
>
> We have looked again at our decision of [date]. The person who reviewed it was not the person who made it.
>
> [**We have changed our decision.** Your account is no longer suspended. / We cannot restore the removed message, but you are welcome to post again within our rules.]
>
> [**We have kept our decision**, because [reason].]
>
> If you are unhappy with how we handled your appeal, our complaints procedure explains what you can do next: https://link.resbite.com/support
>
> Resbite
>
> [Signature]

### N9. Defamation notices

**N9a. To the complainant (within 48 hours, not counting non-business days):**

> We received your notice of complaint on [date and time]. We have sent it to the person who posted the statement [without your name and email, as you asked]. They have until midnight UK time on [date] to answer. We will tell you what happens.

**N9b. To the poster (within 48 hours, not counting non-business days):**

> We have received the complaint below about a statement you posted on Resbite: [where]. [Copy of the notice, with the complainant's name and email removed if they asked.]
>
> We may remove the statement unless, by **midnight UK time on [date: the end of the 5th day after today]**, you reply in writing to tell us:
> 1. whether you want the statement removed;
> 2. if you do not want it removed, your full name and the postal address where you live or carry on business; and
> 3. whether you agree to us giving those details to the person who complained.
>
> If you do not agree, we will not give them your details unless a court orders us to.

**N9c. To the complainant, if the notice is incomplete (within 48 hours, not counting non-business days):**

> Your notice does not contain everything the Defamation (Operators of Websites) Regulations 2013 require. A notice must give: your name and an email address; where the statement is; what it says and why it is defamatory of you; the meaning you give it; which parts you say are untrue or opinions not supported by fact; confirmation that you do not have enough information about the poster to bring proceedings against them; and whether you consent to your name and email being given to the poster.

## 20. What we record

**In the database.**
- Each report's status, action, review time and a short note through `close-report.sql`. The note holds the moderation log's case number, never a name, number or email. The time from `created_at` to `reviewed_at` measures the 24-hour standard.
- Suspensions, in `private.suspensions`.
- Legal holds, through the C6 script **[needs C6]**.

**In the moderation log**, outside the repo, in the log tool (placeholder 3). One row per case:

| Field | Content |
|---|---|
| Case number | MOD-YYYY-NNN |
| Received | Date and time; channel (app report id, support inbox, contact form, authority) |
| Reason | The category from section 8.3, or the section of this standard |
| What | The kind of content (message, photo, name, title …), never the content itself |
| Accounts | The account ids involved, needed for an undo or a hold |
| Decision | The rule broken, or none, and the reason in one or two lines |
| Actions | Each action and its time: removed, hidden, suspended, banned, hold set |
| Clock | Whether the 24-hour or 48-hour standard was met; if not, why |
| Notices | Template, channel and date |
| Authorities | NCA, police or Counter Terrorism Policing reference numbers only |
| Appeal | Date, who decided (role), outcome |
| Closed | Date; the date the row is due for deletion |

The log never holds the reported material, a copy of a message beyond the frozen copy already in the report, or a CSEA image or its description.

**Retention.** Closed reports: deleted 180 days after closing (decision R-Q3). A report whose reporter deletes their account stays until it is closed, then 180 days, with the reporter id cleared (ruling AS-R2): deal with it as usual **[needs C2; today it is deleted with the account, `supabase/migrations/20261116120000_open_beta.sql:255`]**. Suspension records: while suspended, then 12 months after the suspension is lifted (D-8); if the account is deleted, the user id is cleared and the reason and the dates stay for 12 months after the deletion (ruling AS-R1, with D-19) **[needs C3; and C2 to keep the record when the account is deleted, see below]**. Moderation log rows: 24 months after the case closes, longer under a legal hold (`retention-schedule.md`).

**Code and ruling differ.** Today `private.suspensions` is deleted with the account (`on delete cascade`, `supabase/migrations/20261111160000_chat_safety.sql:794-795`), and the reason lives only in the linked report. Ruling AS-R1 keeps the record for 12 months after the person deletes their account, with the user id cleared and the reason and the dates kept. C2 must build that; until then the moderation log row is the only record.

**In the repo.** Nothing about any case. Only the yearly figures in section 22, as numbers.

## 21. The backup moderator's access rules

The full written instructions and confidentiality agreement are in `team-access.md` (A24), signed before access is given. In short:

| The backup may | The backup must not |
|---|---|
| Run the scripts in section 7 that this standard gives them, and the read-only `open-reports.sql` | Browse tables, chats or profiles, or run any query that is not one of those scripts |
| Read the safety messages in the support inbox, and send the templates in section 19 by email | Use the privacy inbox, which is the owner's |
| Look up an account in the Auth dashboard to ban, unban or find its email for a notice | Change settings, functions, keys, schema or anyone's access |
| Set a legal hold in a CSEA or intimate image case **[needs C6]** | Download, screenshot, copy, print or forward any personal data or reported material |
| Make an NCA report as a registered portal user | Paste anything from Resbite into another tool, including AI assistants, translators and personal notes |
| Escalate to the owner at any time | Act on a case involving themselves or someone they know |

MFA is on for every account the backup uses. On Supabase Pro the lowest role that can run the scripts is Developer, which can read every table (PRV-17); these rules are what limit it, and the DPIA (A9) records the risk.

## 22. Review and yearly figures

Each year, and before any significant change, the owner reviews this standard and records these figures, as numbers only, for the illegal content risk assessment (A13) and the children's access assessment (A14):
- reports received, by reason and channel;
- the share acted on within 24 hours, and intimate image reports within 48 hours;
- removals, suspensions and Auth bans;
- CSEA reports to the NCA; reports to Counter Terrorism Policing;
- under-18 cases (A14);
- ban evasion cases (A13, decision D-25);
- appeals received and overturned;
- missed standards and why;
- legal holds set and lifted.

## 23. What must be built for this standard to work in full

| Item | What this standard needs from it |
|---|---|
| B6 | The suspended screen shows the support address and Delete account |
| B7, C7 | The reasons Child safety, Intimate image shared without consent, and Illegal or dangerous; the report thanks giving the review time (AS-R9); `open-reports.sql` listing them first; the wider blocked-terms check |
| B11, C9 | No date of birth collected or stored |
| C1 | Twilio, for text notices and for contacting a poster under section 16.1 |
| C2 | Deletion while suspended; the legal hold in deletion; keeping the suspension record after deletion, with the id cleared (AS-R1); keeping a deleted reporter's reports, with the id cleared (AS-R2) |
| C3 | Hold-aware retention jobs, including the closed-report purge and the orphan photo clean-up |
| C5 | The backup added with `moderators.sql` and given dashboard access with MFA |
| C6 | The owner-run deletion script for banned, web-only and under-18 accounts, with the app's lifecycle (AS-R3); suspend by account id; lift a suspension while keeping its record and the lift date; remove a photo, title, description, notes or cover, with "hide and preserve"; set and lift a legal hold. Also wanted: reset a display name; remove an unreported message; cancel a suspended host's resbites; lookups from an emailed description |
| D1 | The /support page and contact form, with the route for affected people and intimate images |
| F1 | The support inbox, watched daily for safety reports |
| F2 | The rota with the backup the owner names (AS-D6) |
| F10 | Alerts on the push sender, which carries the moderators' "new report" push |
| A3, A5, A13, A24 | The Terms (rules, 18+, intimate images), the complaints procedure (appeal times), the risk assessment (prevention measures, evasion), the signed instructions |

## 24. Sources

- [ARG 1.2] Apple, App Review Guidelines, 1.2 User-generated content: https://developer.apple.com/app-store/review/guidelines/
- [ANEWS-1026] Apple, nonconsensual imagery update: https://developer.apple.com/news/?id=92th7e5i
- [NCA-OSA] National Crime Agency, "The Online Safety Act and the Role of the National Crime Agency", version 1.0, 7 April 2026 (read directly): https://www.nationalcrimeagency.gov.uk/who-we-are/publications/802-the-online-safety-act-and-the-role-of-the-nca/file
- [NCA-REG] National Crime Agency, "How to register your organisation for the Child Sexual Exploitation and Abuse Industry Reporting Portal", version 1.0, 7 April 2026 (read directly): https://www.nationalcrimeagency.gov.uk/who-we-are/publications/803-how-to-register-your-organisation-for-the-child-sexual-exploitation-and-abuse-industry-reporting-portal/file
- Online Safety (CSEA Content Reporting by Regulated User-to-User Service Providers) Regulations 2026, S.I. 2026/268 (not read; retention periods from secondary sources, UNVERIFIED): https://www.legislation.gov.uk/uksi/2026/268/contents/made
- [MOJ-DEF] Ministry of Justice, "Complaints about defamatory material posted on websites: Guidance on Section 5 of the Defamation Act 2013 and Regulations", January 2014 (read directly): https://assets.publishing.service.gov.uk/media/5a7c606440f0b626628aba0b/defamation-guidance.pdf
- Online Safety Act 2023 ss.10, 20, 20A, 21, 22, 66 and Schedule 6 (read through the gap analysis and the law report; legislation.gov.uk refused automated reads): https://www.legislation.gov.uk/ukpga/2023/50
- [OFCOM-CODES] Ofcom, Illegal content Codes of Practice for user-to-user services, 9 September 2026 (x): https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/detecting-intimate-image-abuse/illegal-content-codes-of-practice-for-user-to-user-services-9sep2026.pdf?v=425251
- Home Office, Proscribed terrorist groups or organisations: https://www.gov.uk/government/publications/proscribed-terror-groups-or-organisations--2
- Report online terrorist material: https://www.gov.uk/report-terrorism
- E-Commerce Regulations 2002 reg 19 (not read, UNVERIFIED): https://www.legislation.gov.uk/uksi/2002/2013/regulation/19

(x) means read only through search-engine extracts, because the site refused automated reads.
