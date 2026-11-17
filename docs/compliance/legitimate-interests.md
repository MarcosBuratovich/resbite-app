# Legitimate interests assessments

| | |
|---|---|
| **Owner** | The owner, for Resbite Ltd |
| **Version** | 1.0 — draft for solicitor review (decision D-12), not yet adopted |
| **Date** | 17 November 2026 |
| **Next review** | Before the 1.0 submission, then no later than 17 November 2027, and before any change to a purpose below (F15) |
| **Purpose** | The three-part test (purpose, necessity, balancing) for every purpose Resbite Ltd bases on legitimate interests under UK GDPR Art 6(1)(f), and the record of the recognised legitimate interests it relies on. |

This is an internal record (A10). It holds no personal data. It is not legal advice. A UK solicitor reviews it before launch (decision D-12).

**What it describes.** Resbite as it will be at version 1.0, after workstreams B, C and D of the gap analysis are built and the F operations are in place, using the recommended default for every owner decision D-3 to D-25. Where a statement is not true yet, it carries **[needs X]**, naming the item that makes it true. "The gap analysis" is `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`. Purposes and activity ids (LB-n, PA-n) are those in `records-of-processing.md`. Periods are those in `retention-schedule.md`.

## Placeholders to fill

1. [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]]
2. [[OWNER: the DPA 2018 Schedule 1 condition for criminal offence data in reports, chosen with the solicitor — proposed: paragraph 12 (regulatory requirements relating to unlawful acts), with paragraph 10 (preventing or detecting unlawful acts) as the alternative, each extended to criminal offence data by paragraph 36; paragraph 18 (safeguarding) for child-safety reports; paragraph 33 (legal claims) for records under a legal hold]]
3. [[OWNER: Vercel plan for the link site, which sets how long its request logs last — proposed: Pro, which keeps request logs for 1 day and is covered by Vercel's data processing agreement]]

## How each assessment works

Each assessment follows the three-part test in the guidance of the UK regulator, the Information Commission, which took over from the Information Commissioner's Office on 30 September 2026 and still uses the name ICO (ico.org.uk). The guidance was read only in search extracts (see Sources):
1. **Purpose.** Is there a legitimate interest? Whose is it, and what does it achieve?
2. **Necessity.** Is the processing needed for it? Is there a less intrusive way to get the same result?
3. **Balancing.** Do the person's interests, rights and freedoms override it? This weighs the kind of data, what people would reasonably expect, the likely impact, whether children or vulnerable people could be affected, and the safeguards.

Each ends with the outcome, how an objection under Art 21 is handled, where people are told, and what must be built first.

**Children.** Art 6(1)(f) asks for extra weight where the person is a child. Resbite is for adults only, but a host can pick any number, and a child could get past the 18+ confirmation. Each assessment considers that.

**The 2025 examples.** The Data (Use and Access) Act 2025, s.70, added examples of processing that may be done for legitimate interests, among them direct marketing, intra-group transfers and the security of network and information systems. They are examples: the balancing test still applies (read in extract only; for the solicitor). Resbite does no direct marketing.

**Recognised legitimate interests** (Art 6(1)(ea) and Annex 1) need no balancing test. The last section records the ones Resbite relies on.

## Summary

| Id | Purpose | People mainly affected | Outcome | Period | Needs |
|---|---|---|---|---|---|
| LI-1 | Check picked numbers and show who is "On Resbite" | Anyone whose number a host picks | Passes, with limits | Not stored; a daily count | B8, B5 |
| LI-2 | Keep a non-user's number for one personal invitation | Invited non-users | Passes, if the schedule, the notice and the suppression list are in place | Until answered or revoked, or 30 days after the resbite ends | C3, D3, A1, A2 |
| LI-3 | Keep removal records per series | Removed users and non-users | Passes | 30 days (one-off) or 90 days (series) after the end | C3 |
| LI-4 | Keep the objection suppression list | Non-users who object | Passes | Until the objection is withdrawn | C3, D3 |
| LI-5 | Record the 18+, Terms and chat-rules acceptance | All account holders | Passes | While the account exists | B2, C8, D3, D4 |
| LI-6 | Run the blocked-terms filter | Everyone who writes | Passes | Nothing stored | C7 |
| LI-7 | Keep moderation evidence | Reporters and reported people | Passes, with an Art 10 condition | Open, then 180 days after closing | C3, B7, C7, C2, A15 |
| LI-8 | Keep suspension records | Suspended people | Passes | While suspended, then 12 months after it is lifted or the account is deleted | C2, C3, C6 |
| LI-9 | Let the team see blocks | Blocked people | Passes | Until unblocked | — |
| LI-10 | Keep connection refusals hidden from the asker | People who asked | Passes | 12 months | C3 |
| LI-11 | Count link opens | Hosts (opens are anonymous) | Passes | 12 months | C3 |
| LI-12 | Security logs, abuse limits and CAPTCHA | Users and web visitors | Passes | Platform periods; counters while the account exists | B16, D10, C11, C1, D5, F14, F16 |
| LI-13 | Backups | Everyone in the database | Passes | 7 days | C2, F11 |
| LI-14 | Case records and legal holds | People who contact us; people named in cases | Passes | 24 months after closing; holds while needed | F1, F3, F4, F17, C2, C6, A22 |
| LI-15 | Deletion receipts | People who delete their account | Passes | 30 days after clean-up | C2 |
| LI-16 | App Store figures and crash reports from Apple | People who chose to share with developers | Passes | Apple's periods | — |

---

## LI-1 · Check picked numbers and show who is "On Resbite"

**What happens.** When a host chooses phone contacts or types a number, the app sends only the numbers the host picks, as plain digits, at most 50 a call and 500 a day, to `contacts_on_resbite`. The server compares them with the numbers of confirmed accounts that have used the app (`private.app_sessions`) and answers which belong to users. It stores nothing of the lookup except a daily count per host (`supabase/migrations/20261028120000_contact_invitations.sql:30-81`). Contact names never leave the phone. Blocked people are left out of the answer (`supabase/migrations/20261111160000_chat_safety.sql:725`). The side effect: anyone who has a user's number can learn that they use Resbite (DI §12). Activities PA-07, PA-20; purpose LB-04.

**Purpose.**
- The host's interest: invite friends they already know, quickly, in the app.
- Users' interest: be found by friends. This is why every account needs a verified number ("Your friends find and invite you by your number.", `mobile/src/domain/phoneCopy.ts:30`).
- Resbite's interest: its core feature works.
- For an app user found this way, no number is stored at all: they are added to the guest list. So the lookup also reduces storage.

**Necessity.**
- Only the numbers the host picks are sent. There is no address-book upload and no "select all" (PERM-4).
- Numbers are compared and discarded, not kept.
- Considered and rejected: hashing numbers on the phone. Phone numbers are a small space, so a hash is easy to reverse, and Apple counts hashed numbers as phone numbers. It adds no real protection.
- Considered and rejected: no lookup at all. Every invitation would become a stored-number link, which keeps more non-user numbers on the server, not fewer.
- Adopted: email fields are no longer read from Contacts, and the Contacts purpose string says the picked numbers are checked **[needs B8]**.
- Later option: the system contact picker, which limits what the app can read on the phone (PERM-3). It does not change what the server receives.

**Balancing.**
- *Kind of data.* A phone number is a direct identifier, but not special category data.
- *Expectations.* Users are told at Add your number that friends find them by number. Non-users have no relationship with Resbite and would not expect a check, but nothing about them is kept and the answer for them is only "not on Resbite".
- *Impact and risk.* The main risk is enumeration: someone who has a person's number, such as an abusive former partner, learns that the person uses Resbite. That person still cannot see their plans, which are private to the guests.
- *Safeguards against that risk:* the 500-a-day limit; a person can block someone, which removes them from that person's lookups; only accounts that have used the app are shown; the DPIA weighs the remaining risk (A9).
- *Children.* A host may pick a child's number. The answer is the same as for any non-user: nothing is kept.

**Outcome.** Legitimate interests apply, with the limits and the disclosures.

**Objections.** A user who objects to being discoverable can block the people concerned, or delete their account. A "don't show me as On Resbite" setting would let users object without blocking; it is a candidate for after 1.0 (open point). A non-user's objection is honoured by LI-4, though the lookup itself keeps nothing to object to.

**Told where.** The privacy notice (A1); Data & privacy (B5, which keeps the accurate line "Resbite checks only the numbers you pick to see who already uses it"); the Contacts purpose string **[needs B8]**.

**Review.** Yearly, and before any change to the limits or the matching.

---

## LI-2 · Keep a non-user's number for one personal invitation

**What happens.** When a host or a trusted guest invites someone who is not a user, `invite_contacts` stores that person's number and calling code in `private.phone_invitations`, with a SHA-256 hash of the personal code, who invited, and later who answered and when (`supabase/migrations/20261028120000_contact_invitations.sql:12-25`; the current body is `supabase/migrations/20261111160000_chat_safety.sql:686-703`). The host sends the link from their own WhatsApp or Messages, with neutral text they can edit (PERM-4). The invitee opens `/i/<code>`, sees the event, the number's calling code and last two digits, and a short notice with a separate right-to-object line **[needs D3]**. They may answer, which needs a code sent by SMS to that number and creates a web-only account, or ignore it. The number is deleted when the invitation is answered or revoked, or 30 days after the resbite ends, whichever comes first **[needs C3]**. Activity PA-08; purpose LB-05.

**Purpose.**
- The invitee's interest: join a friend's plan without installing the app, and only if they are the person invited.
- The host's interest: invite people who are not on Resbite, and see who replied.
- Resbite's interest: make the personal link work and stop a wrong person answering (the wrong-number check allows 10 tries an hour).

**Necessity.**
- The number is needed to check that the person answering holds the number the host gave (`check_invited_number`, `answer_phone_invitation`), and to link the answer to the invitation and later to the app account (the fold, DI §10).
- Considered: storing only a keyed hash of the number. Matching would still work. It was not adopted for 1.0, because several live functions match and display by the number (the phone key, the fold, removals, the last-two-digits display). The short period limits the exposure. Revisit after 1.0 (open point).
- Considered: the open event link (`/r/`) instead. It already exists, but needs the host to approve each person and cannot tell a stranger from the friend invited. The personal link is the safer choice for small private plans.
- Adopted: the shortest period that still lets the invitee answer before the event.
- Adopted: Resbite itself never sends the invitee anything. The host does, from their own phone. This keeps the number out of any Resbite messaging and out of PECR direct marketing.

**Balancing.**
- *Kind of data.* A phone number, received from a third party (the host), not from the person.
- *Expectations.* Being invited by a friend's message is ordinary. A person would not expect a company to keep their number. The notice on `/i/` tells them, at Resbite's first contact with them **[needs D3]**, and the number is kept only briefly.
- *Impact.* Low. No marketing, no messages from Resbite, no profile built. Others see only the last two digits on the page. The full number is never shown to anyone but the inviting host, who already has it.
- *Risk.* A host could invite someone who does not want contact. That person can ignore the link, object (LI-4), or report through the support address or the web form **[needs D1]**.
- *Children.* A host could invite a child's number. The child cannot answer without confirming they are 18 or over **[needs D3, C8]**, and the number is deleted on schedule. The parent of a child may use the affected-person route (A15).
- *Invisible processing.* If the invitee never opens the link, they never see the notice. Art 14(5)(b) (disproportionate effort) and the public notice in A1 then apply. The DPIA weighs this as invisible processing (A9). The solicitor should confirm this reading (open point).
- *Safeguards.* Row security with no grants; the code stored only as a hash; the 500-a-day limit; the suppression list (LI-4); the short period; no Resbite-sent messages.

**Outcome.** Legitimate interests apply, on three conditions: the retention job **[needs C3]**, the notice with its separate objection line **[needs D3, A2]**, and the suppression list **[needs C3, D-23]**. Without them this test fails.

**Objections.** The objection statement sits in its own clearly separated line on `/i/` and in A1 (Art 21(4); PRV-19) **[needs D3, A1]**. An objection deletes every invitation row holding that number, for every host, and adds the number to the suppression list (LI-4). It takes effect at once.

**Told where.** On `/i/` beside the number field **[needs D3]**; in the privacy notice's section for people invited by number (A2).

**Review.** Yearly, and before any change to who receives the number or how long it is kept.

**Code note.** `phone` is `not null` today (`contact_invitations.sql:15`). To delete the number at answer or revocation, C3 must either delete the row or make the column nullable. The host's view of who replied comes from the guest row, so deleting the invitation row loses nothing the host needs.

---

## LI-3 · Keep removal records per series

**What happens.** When a host removes a guest, declines a link request, or revokes a personal link, `private.plan_removals` records the series, the person's account id or number, and the time (`supabase/migrations/20261111130000_circles_of_trust.sql:38-51`). A guest then cannot bring that person back to the series by connection or by number, and no link lets them back, until a host invites them again or approves them. Number rows are deleted 30 days after a one-off ends, or 90 days after a series' last occurrence **[needs C3]**. Account deletion removes account-id rows at once (`supabase/migrations/20261116120000_open_beta.sql:249`). Activity PA-09; purpose LB-06.

**Purpose.** Respect the host's decision and protect the host and the guests from a person the host removed. Without it, the circles of trust (guests bringing people) would undo a removal straight away.

**Necessity.**
- The record holds only the series and one identifier.
- Considered: blocking instead. A block is between two people, not per series, and a non-user cannot be blocked.
- Considered: asking the host to remove the person again each time. That is a burden, and unsafe if the person turns up first.
- Adopted: the record works for that series only, and ends with it.

**Balancing.**
- *Expectations.* The removed person may not expect a lasting record. Its effect is narrow: a guest cannot bring them back to that one series. A host can still invite them directly.
- *Impact.* Low. It is not shared or used anywhere else.
- *Number rows* are non-users' data, so they are kept briefly.
- *App Store guideline 5.1.1(viii)* bars compiling personal data not obtained from the person. The numbers came from the host's own invitation and serve only that series. The DPIA weighs this (A9; PRV-20).
- *Children.* As LI-2.

**Outcome.** Legitimate interests apply.

**Objections.** A removed person who objects is considered case by case. The record exists to protect others, so an objection is usually outweighed while the series runs.

**Told where.** The privacy notice (A1), in the sections on resbites and on people invited by number.

**Review.** Yearly.

**Code note.** The D-8 table gives a period only for number rows. This assessment proposes the same periods for account-id rows, deleted by the same C3 job (open point).

---

## LI-4 · Keep the objection suppression list

**What happens.** When a non-user objects, by writing to privacy@resbite.com or through the contact form on `/support` (the notice on `/i/` tells them how), Resbite stores a keyed hash of their number (an HMAC under a server-held secret) and the date. `invite_contacts`, the only function that stores a non-user's number, checks the list and refuses to store that number again. The host is told the person cannot be invited by link. The entry stays until the person withdraws the objection **[needs C3, D-23]**. Activity PA-10; purpose LB-07.

**Purpose.** Honour an objection across every host. Deleting one invitation row does not stop the next host (PRV-19).

**Necessity.**
- Remembering an objection needs something that recognises the number. A keyed hash is the least that works: no name, no plain number, no record of who invited.
- A plain hash would not do. Phone numbers are a small space, so a plain hash can be reversed; a keyed hash cannot be without the secret.
- Considered and rejected: a plain-number list (more exposure) and no list (the objection would not hold).

**Balancing.**
- The person asked for this, and it serves their own wish.
- The period is open-ended by design: an end date would bring the invitations back.
- Hosts lose only the ability to send that person a Resbite link. They can still message them directly.
- If the person later makes an account with that number, nothing changes for them: users are invited inside the app and no number is stored.

**Safeguards.** The secret is held as a server secret, never in the repo or the app. Rotating it would invalidate the list, so it is rotated only if it is exposed. In that case the list is rebuilt from the objections recorded in the request log (F3).

**Outcome.** Legitimate interests apply. The solicitor may prefer legal obligation, Art 6(1)(c), since the list serves the duty to honour objections.

**Objections.** Not applicable: the list exists because of an objection. Withdrawal is by request to privacy@resbite.com, and the entry is deleted by hand.

**Told where.** On `/i/` next to the objection line **[needs D3]**; in A1 and A2.

**Review.** Yearly, including whether entries can be safely limited in time.

---

## LI-5 · Record the 18+, Terms and chat-rules acceptance

**What happens.** Every account, in the app and on the web, confirms it is 18 or over and accepts the current Terms version. Resbite records the time, the version and the method, per version **[needs B2, C8, D3, D4]**. Today `private.age_attestations` is written once, only on some routes (SI-7). Before a first chat message, Resbite records the chat rules version accepted (`private.chat_rules_acceptances`). Kept while the account exists. Activity PA-03; purpose LB-02.

**Purpose.** Show who agreed to which version. Enforce the age limit in the same way for everyone (LAW-37). Defend decisions and claims.

**Necessity.** One small record per version is the minimum that shows acceptance. Considered and rejected: a date of birth. It is more data, and it is removed for 1.0 (D-9).

**Balancing.** The data is minimal and expected, and it protects users by making the rules clear. It is removed when the account is deleted.

**Outcome.** Legitimate interests apply.

**Objections.** An account cannot work without accepting the Terms. A person who objects can delete their account.

**Told where.** A1; the acceptance screen.

**Review.** At each Terms version.

---

## LI-6 · Run the blocked-terms filter

**What happens.** `send_message` and `send_announcement` check the text against a short list of blocked terms (37 on hosted), matched as whole words (`supabase/migrations/20261111160000_chat_safety.sql:999,1057`). A match refuses the message with "Not allowed" and the person can rephrase. The database stores nothing about the refused attempt. At 1.0 the same check runs on titles, descriptions, notes to guests, meeting details and display names **[needs C7]**. Purpose LB-14.

**Purpose.** Stop objectionable material before it is posted. Protect users. Apple requires a filter (guideline 1.2), and it is a proportionate safety measure under the Online Safety Act.

**Necessity.** A filter must read the text. A word list is the least intrusive automated method: no classifier, no third party, no person reading every message, nothing kept. Considered and rejected: no filter (a likely App Store rejection, and more harm), and machine-learning moderation (more intrusive, and a new vendor).

**Balancing.**
- Every message is checked, but only once and only against the list.
- The cost is false positives. A legitimate word may be refused. The person can rephrase and is not penalised.
- It is not a decision about the person.
- Freedom of expression (OSA s.22): the list is kept short and reviewed in the yearly A13 review.

**Outcome.** Legitimate interests apply.

**Objections.** The filter is a condition of posting on the service. An objection is answered by explaining the rule. A person who disagrees with a refused word can write to support.

**Told where.** The Terms and community rules (A3); A1.

**Review.** Yearly with A13, and whenever the list changes.

---

## LI-7 · Keep moderation evidence

**What happens.** A report in `private.reports` holds the reporter, the person or message reported, the reason, details up to 500 characters, a frozen copy of the words and their author (so the evidence survives a deleted or edited message), the review note and the action (`supabase/migrations/20261111160000_chat_safety.sql:763-780`). Open reports stay until closed. Closed reports are deleted 180 days after closing (R-Q3), by a job **[needs C3; manual today, `supabase/ops/purge-closed-reports.sql`]**. A report about a person stays, with its frozen words, even if that person deletes their account (`supabase/migrations/20261116120000_open_beta.sql:250-255`). Reports a person filed go when the reporter deletes their account, unless a legal hold applies **[hold needs C2]**. Activity PA-14; purposes LB-12 (legal obligation) and LB-13 (this assessment, for keeping evidence after closing).

**Purpose.** Decide reports fairly and consistently. Handle appeals (OSA s.21). Spot repeat abuse. Answer the police or Ofcom when the law allows. Keep the records Ofcom expects (OSA s.23).

**Necessity.**
- The frozen copy is needed because an author can delete a message.
- 180 days covers appeals and shows patterns.
- Considered and rejected: deleting at closing (no appeals, no pattern) and keeping indefinitely (excessive).

**Balancing.**
- *Kind of data.* Allegations about a person, which are criminal offence data. The reported person is not told who reported them.
- *Risk.* False or malicious reports. Safeguards: every report is reviewed, and it can close with no action; appeals go through support (A5); only the owner and the backup moderator can read reports **[backup needs C5, A24]**; a reported person's access request never reveals the reporter (A16).
- *Expectations.* Users accept community rules that say reports are kept for 180 days after closing (A1, A3).
- *Reports about a deleted account.* Keeping them serves the reporter, finishes the review, and lets serious matters reach the authorities. The account id and frozen words stay only until 180 days after closing.
- *Children.* Child-safety reports are handled under A15, and preserved under a legal hold where they go to the NCA.

**Art 10.** This processing needs a Schedule 1 condition: placeholder 2 (`records-of-processing.md`, section 7). An appropriate policy document may be needed (A23).

**Outcome.** Legitimate interests apply for keeping evidence after closing, once the Art 10 condition is chosen.

**Objections.** An objection is considered against the reasons above. It is usually outweighed while the report is open or within the 180 days. An erasure request is handled the same way (Art 17(3)), under A16.

**Told where.** A1; the Terms (A3); the report sheet.

**Review.** Yearly with A13.

**Code note (open point).** When a reporter deletes their account, their open reports go too, so a report about a third party can disappear before it is reviewed. Consider keeping open reports with the reporter's id removed until they are closed. This is a C2 decision.

---

## LI-8 · Keep suspension records

**What happens.** `supabase/ops/suspend-account.sql` revokes the account's grant, records what it changed in `private.suspensions` (account, report, roster and grant changes, time). At 1.0 the Auth ban is added only for a ban, not for every suspension (`moderation-standard.md`, section 8.2; D-19). At 1.0 an account can also be suspended by id **[needs C6]**. The record is kept while the suspension lasts, then 12 months after it ends, whether it is lifted or the account is deleted (D-19) **[needs C2, C3, C6]**. A suspension made in error is undone, and the undo deletes the record. Purpose LB-13.

**Purpose.** Enforce the suspension, undo it exactly, handle appeals, and let moderators see recent history when new reports arrive about the same account.

**Necessity.** The record holds only what the undo and an appeal need. Twelve months after lifting is long enough to see whether problems come back, and short enough not to follow a person indefinitely.

**Balancing.** Only moderators know of a past suspension, for a year. It is not shared. The person can appeal (A5). A mistaken suspension leaves no record. A suspended person may delete their account (D-19).

**Outcome.** Legitimate interests apply.

**Objections.** Considered case by case. Usually outweighed during the 12 months.

**Told where.** A1; the Terms (A3); the suspension email **[needs F2]**.

**Review.** Yearly.

**Code note (open point).** The code does not yet support the period. The undo deletes the record at once (`supabase/ops/suspend-account.sql:33-38`), and the record cascades away with the Auth user (`chat_safety.sql:794-795`). So: a lift after an appeal needs a step that records the lift date instead of deleting (C6); and C2 must decide whether the record outlives account deletion, which D-19 suggests ("keep … the suspension record for their own periods").

---

## LI-9 · Let the team see blocks

**What happens.** `private.blocks` stores the blocker, the blocked person and the time (`supabase/migrations/20261111160000_chat_safety.sql:26-35`). The block hides the two from each other in reads, pushes and lookups. The blocked person is never told. The team can read blocks in the database, and looks at them only when reviewing a report or complaint. Purposes LB-15 (the block itself, contract) and LB-13 (team visibility, this assessment).

**Purpose.** Context for moderation: several people blocking one account is a sign of abuse. Handling complaints about blocks.

**Necessity.** The block must be stored to work. Team access comes with running the database. Considered and rejected: hiding blocks from the team. It adds complexity and would weaken moderation.

**Balancing.** The blocked person may not expect the team to see the block. The impact is low: it is never told to them, never used for anything else, and removed on unblock or account deletion.

**Outcome.** Legitimate interests apply.

**Objections.** Usually outweighed while the block stands. The blocker can unblock at any time.

**Told where.** A1 ("blocks visible to the team"); the in-app safety text (`mobile/src/domain/safetyCopy.ts:91`).

**Review.** Yearly.

---

## LI-10 · Keep connection refusals hidden from the asker

**What happens.** When someone answers a connection request with "Not now", or removes a connection, `private.connection_refusals` records the resbite, both people, the time and a "hidden" flag (`supabase/migrations/20261110120000_connections.sql:35-42`). The asker is never told and cannot ask again from that resbite. They can ask from another resbite. An acceptance between the two clears their refusals. Kept 12 months after the refusal **[needs C3]**. Account deletion removes them (`supabase/migrations/20261116120000_open_beta.sql:245`). Purpose LB-10.

**Purpose.** Spare the person who refused from repeated requests, without the social cost of telling the asker.

**Necessity.** Without a record the asker could ask again at once. The flag keeps the asker's view consistent. Considered and rejected: telling the asker (social harm); allowing endless requests (pressure); keeping refusals indefinitely (excessive). Twelve months was chosen.

**Balancing.** The asker has a record about them that they do not see. The effect is small: one chance per resbite. The refusing person benefits. People are told the general rule in the notice (PRV-21), so nothing about it is hidden in principle.

**Outcome.** Legitimate interests apply.

**Objections.** Usually outweighed: the record protects the other person. An access request by the asker raises the other person's rights, and A16 decides what to give under DPA 2018 Schedule 2 (open point).

**Told where.** A1, in the connections section **[needs A1, B5]**.

**Review.** Yearly.

---

## LI-11 · Count link opens

**What happens.** Each time the app opens a live event link, `private.link_opens` stores the link id and the time, with nothing about who opened it, and at most 60 opens a minute per link (`supabase/migrations/20261022120000_gi2_guest_accounts.sql:136-162`). The host sees a count. Kept 12 months **[needs C3]**. Purpose LB-27.

**Purpose.** Show the host how far their link has travelled. Spot unusual traffic.

**Necessity.** A count without any identity is the least data possible.

**Balancing.** It is linked to a person only through the host's link. Openers are anonymous. The impact is negligible.

**Outcome.** Legitimate interests apply.

**Objections.** A host who objects can turn the link off.

**Told where.** A1; Data & privacy (`mobile/app/data-privacy.tsx:107-108`, kept by B5).

**Review.** Yearly.

---

## LI-12 · Security logs, abuse limits and CAPTCHA

**What happens.**
- *Supabase* keeps API, database, Auth, Storage, Realtime and Edge Function logs for 7 days on Pro. Whether API logs hold IP addresses and user agents is UNVERIFIED (DI §9). Auth session records hold IP and user agent (Supabase-managed).
- *Vercel* keeps request logs for the link site, with the path (which holds the link code), search parameters and user agent: 1 hour on Hobby, 1 day on Pro, 30 days with Observability Plus. Placeholder 3.
- *Rate-limit counters:* the daily lookup count; the wrong-number counter on invitations; the report count per day; the link-open limit.
- *CAPTCHA* on code requests, in the app and on `/r/` and `/i/` **[needs B16, D10, C11]**. Placeholder 1. Turnstile's signals are the IP address, TLS fingerprint, user agent and site key; Cloudflare is a processor for bot detection and a controller for improving it. hCaptcha collects device and interaction data.
- *Team access:* MFA status and the six-monthly access review records (roles only) **[needs F16]**.

Purposes LB-24, LB-29.

**Purpose.** Keep accounts and data secure (Art 32). Detect and stop abuse: SMS pumping, number enumeration, spam, account takeover. Investigate incidents and breaches. Keep the service running.

**Necessity.**
- Resbite adds no logging of its own beyond the platforms' standard logs, and their periods are short.
- The counters hold only what a limit needs.
- CAPTCHA runs only on code requests.
- Considered and rejected: no CAPTCHA (SMS cost and takeover attempts, OPS-5) and home-made bot detection (more data, less effective).

**Balancing.**
- Security logging is expected. It is short-lived and used for nothing else.
- CAPTCHA adds a third party. On the link site it is a script, which needs the PECR reg 6 strictly-necessary exemption (assess it under D10). In the app it is an SDK, which goes into the privacy label (E3) and the privacy manifest (B13).
- Children: as for any user.

**Outcome.** Legitimate interests apply.

**Objections.** Usually outweighed: the measures protect every user. An objection to CAPTCHA can be met by help through support, case by case.

**Told where.** A1 (logs, storage on the device, CAPTCHA); the link site notice **[needs D3, D10]**.

**Review.** Yearly, and before any new logging, analytics or alerting tool.

---

## LI-13 · Backups

**What happens.** Supabase keeps seven daily backups of the database. Point-in-time recovery is off (D-15). Backups hold Storage metadata, not image files (`qa/b0-retention-proposal.md:21-23`). Data deleted from the live database lives on in backups for up to 7 days. A restore replays deletions from the receipts before the app reopens **[needs C2, F11]**. Purpose LB-26.

**Purpose.** Recover from loss, corruption or attack.

**Necessity.** Backups cannot be edited row by row. Seven days is the platform's standard period on Pro.

**Balancing.** Data stays up to 7 days after deletion, out of reach, and is used only in a disaster, with the deletions replayed. People are told (A1, A6).

**Outcome.** Legitimate interests apply.

**Objections.** Not practicable for a single backup. The 7-day period answers the concern.

**Told where.** A1; the "How to delete your account" page (A6).

**Review.** Yearly, and if point-in-time recovery is switched on.

---

## LI-14 · Case records and legal holds

**What happens.**
- Support emails, contact-form messages **[needs D1]**, the data request log, the complaints log and the law-enforcement request log are kept for 24 months after the case closes, outside the repo **[needs F1, F3, F4, F17]**.
- A legal hold pauses deletion of named records while a police request, an NCA report, an Ofcom notice or a legal claim is open or reasonably expected **[needs C2, C3, C6, A22]**.

Purposes LB-17, LB-18, LB-21.

**Purpose.** Show compliance (Art 5(2); DPA 2018 s.164A; OSA ss.21 and 23). Answer follow-ups and repeat requests. Establish, exercise or defend legal claims. Preserve evidence for the authorities.

**Necessity.** Twenty-four months covers follow-ups and regulator enquiries without keeping cases for years. A hold covers only the named records, only while needed.

**Balancing.**
- Case records can be sensitive: complaints, reports of abuse, requests for intimate images to be removed. Only the owner and, for moderation cases, the backup moderator can see them.
- A15 says never to ask for, keep or forward an intimate image or abuse material itself.
- A hold delays a person's erasure. They are told, unless telling them would harm an investigation, which A22 decides.

**Outcome.** Legitimate interests apply. Where an Ofcom preservation notice or a court order requires the hold, the basis is legal obligation.

**Objections.** Usually outweighed during the 24 months and while a hold is needed.

**Told where.** A1; the Support page (A4); the complaints procedure (A5).

**Review.** Yearly. Each hold is reviewed at least every three months and when its matter changes, and lifted as soon as it is no longer needed (A15, section 18; A22).

---

## LI-15 · Deletion receipts

**What happens.** `private.account_deletion_jobs` keeps the request id, the account id, a hash of the recovery secret, the status and times, until 30 days after clean-up completes. Then `purge-deletion-receipts` deletes it (`supabase/migrations/20260923152943_deletion_receipt_retention.sql`) **[needs C2]**. Photo clean-up records follow the same pattern. Purpose LB-23.

**Purpose.** Prove the deletion was done. Let the person check its status. Replay deletions after a restore, so deleted accounts do not come back.

**Necessity.** Ids only, no content. Thirty days is longer than the 7-day backup window, so any restore can replay.

**Balancing.** The person asked for deletion, and the receipt serves that wish. The impact is low.

**Outcome.** Legitimate interests apply.

**Objections.** Not practicable: deleting the receipt early would risk the deletion being undone by a restore.

**Told where.** A6; the in-app "What happens" text **[needs B3]**.

**Review.** Yearly, and if the backup period changes.

---

## LI-16 · App Store figures and crash reports from Apple

**What happens.** Resbite has no analytics or crash SDK (D-15). Apple shows the developer aggregated App Store figures, and crash reports from people who chose on their device to share with developers. TestFlight shows testers' feedback. What App Store Connect shows for 1.0 is UNVERIFIED in detail. Activity PA-21; purpose LB-28.

**Purpose.** Find and fix crashes. Understand downloads.

**Necessity.** Using what Apple already provides, under the user's own choice, avoids adding an SDK.

**Balancing.** The person chose to share. The data is technical, and it is not joined with account data.

**Outcome.** Legitimate interests apply.

**Objections.** The person controls sharing in their iPhone settings.

**Told where.** A1.

**Review.** After launch, once the App Store Connect data is known.

---

## Recognised legitimate interests (no balancing test)

UK GDPR Art 6(1)(ea) and Annex 1, in force since 5 February 2026, list purposes that need no balancing test (text not re-read; ICO guidance read in search extracts only). Resbite relies on these for disclosures it is not legally required to make (purpose LB-20):

| Annex 1 purpose | When Resbite uses it |
|---|---|
| Disclosure to a public body that says it needs the data for its public task | A police force or other body asks, without a court order |
| Crime: detecting, investigating or preventing crime, or catching or prosecuting offenders | A moderator finds evidence of a crime, or the police ask for it |
| Emergencies | A threat to life or health linked to a meet-up. Call 999 first, then disclose the minimum |
| Safeguarding vulnerable individuals | A child or an adult at risk |

**Still required:** the disclosure must be necessary, and limited to the minimum. Art 5 still applies. Criminal offence data still needs the Schedule 1 condition (placeholder 2). A22 sets the checks: who is asking, on what legal basis, what exactly is needed. It also sets the log, kept outside the repo **[needs A22, F17]**. Where the law requires the disclosure, such as an Ofcom information notice (OSA s.100), a court order or an NCA report (OSA s.66), the basis is legal obligation instead.

## Sources

- The gap analysis, sections 3.4 (PRV-3, PRV-5, PRV-18 to PRV-21), 4 (A10), 5 (D-8, D-13, D-19, D-21, D-23, D-25) and 7: `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`
- `research_notes/App Store readiness/uk-eu-law.md` (LAW-4 to LAW-7, LAW-21, LAW-22); `audit-data-inventory.md` (§5–§13)
- Code checked on 17 November 2026: the files cited in each assessment
- ICO, legitimate interests and recognised legitimate interest (search extracts only; the site refused automated reads): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/legitimate-interests/ ; https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/recognised-legitimate-interest/
- Data (Use and Access) Act 2025, s.70 (examples of legitimate interests; read in extract only): https://www.legislation.gov.uk/ukpga/2025/18/section/70
- UK GDPR Arts 6, 14 and 21 (text not re-read): https://www.legislation.gov.uk/eur/2016/679
- Cloudflare, Turnstile privacy addendum (last updated 18 June 2025; read 17 November 2026): https://www.cloudflare.com/turnstile-privacy-policy/
- hCaptcha privacy policy (last updated 7 October 2025; read 17 November 2026): https://www.hcaptcha.com/privacy
- Vercel, runtime logs (log periods by plan; read 17 November 2026): https://vercel.com/docs/logs/runtime
