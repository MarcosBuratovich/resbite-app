# Data request procedure

| | |
|---|---|
| **Owner** | The owner, for Resbite Ltd (the controller) |
| **Version** | 1.0 — draft for solicitor review (decision D-12), not yet in force |
| **Date** | 17 November 2026 |
| **In force from** | [[OWNER: effective date — proposed: the day version 1.0 is released on the App Store]] |
| **Next review** | No later than 17 November 2027, and before any change to what Resbite stores (F15) |
| **Purpose** | How Resbite checks who is asking, answers access, erasure, correction, objection and portability requests within one month, and what it withholds to protect other people. |

This is an internal procedure (gap analysis item A16; rows PRV-8, SI-9, DEL-7, WEB-5). It holds no personal data: people appear only by role. A UK solicitor reviews it with the public documents before launch (decision D-12). It is written to be complete and usable as it stands.

**What it describes.** Resbite at version 1.0, after workstreams B, C and D of the gap analysis are built, using the owner's answers and the rulings of 17 November 2026 (AS-D1 to AS-D8 and AS-R1 to AS-R9 in `knowledge-base/08-decisions.md`) and otherwise the recommended default for every owner decision D-3 to D-25. A step that is not possible yet carries **[needs X]**, naming the gap analysis item that makes it possible. Section 15 lists them.

**References.** "The gap analysis" is `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`. Table names come from `supabase/migrations/`. Companion records in this folder: `records-of-processing.md` (A8), `retention-schedule.md` (A12), `moderation-standard.md` (A15), `law-enforcement-requests.md` (A22), `breach-response.md` (A17). The public description is in the Privacy Policy (https://link.resbite.com/privacy, A1) and on https://link.resbite.com/delete-account (A6).

**The regulator.** The Information Commission (ICO), ico.org.uk. It took over from the Information Commissioner's Office on 30 September 2026 and still uses the name ICO.

## Placeholders to fill

1. [[OWNER: effective date — proposed: the day version 1.0 is released on the App Store]]
2. [[OWNER: mailbox provider for support@resbite.com and privacy@resbite.com — proposed: a business email service under a signed data processing agreement, with data held in the UK or EU and MFA on]]
3. [[OWNER: tool that holds the moderation, request, complaint, breach and law-enforcement logs — proposed: one access-controlled spreadsheet in the mailbox provider's business workspace, under the same data processing agreement]]
4. [[OWNER: VAT number, or delete if not VAT-registered]] (in the signature of every reply, section 14)

---

## 1. Scope

**Rights covered** (UK GDPR Arts 12A and 15 to 21, as amended by the Data (Use and Access) Act 2025): access, rectification, erasure, restriction, portability and objection. Resbite makes no decisions based solely on automated processing with legal or similarly significant effects (Art 22): the blocked-terms filter only refuses a message before it is posted, and every moderation decision is made by a person.

**Who may ask.**
- App users, whatever their sign-in method: phone, Apple, Google, or email and password.
- **Web-only accounts**: people who answered an invitation on link.resbite.com with their number and never used the app.
- **Suspended and banned accounts.**
- **People who are not users** whose phone numbers a host picked for an invitation, or that are kept in a series' removal list.
- People who reported someone, and people who were reported.
- Someone acting for any of these, with authority (section 4.5).

**Channels.** privacy@resbite.com is the address for requests and data protection complaints. A request is valid however it arrives: the "Request a copy of my data" row in the app, which opens a pre-filled email **[needs B14]**; the contact form on https://link.resbite.com/support **[needs D1]**; an email to support@resbite.com (forward it to privacy@resbite.com the same day); a letter to the registered office; a message that does not use the word "request". Each one starts the clock on the day it arrives.

**Not covered here.** Content reports and appeals (`moderation-standard.md`); police, NCA, Ofcom and court requests (`law-enforcement-requests.md`); breaches (`breach-response.md`). A data protection complaint follows the complaints procedure (A5): acknowledge it within 30 days, take appropriate steps without undue delay, and tell the person the outcome (DPA 2018 s.164A).

## 2. The clock

| Rule | What it means |
|---|---|
| **One month** | Answer within one month of the "relevant time" (Art 12A): the day we receive the request, or, if we need it, the day we receive the identity check or the information we asked for. Count from the day of receipt to the same date next month. If there is no such date, use the last day of that month. If the deadline falls on a weekend or bank holiday, the ICO's guidance allows the next working day. Plan to answer well before it. |
| **Stop the clock** | If we reasonably need more information to identify the person, or to identify the data or processing the request is about, ask at once. The clock pauses on the day we ask and starts again the day after the answer arrives (Art 12A, from 5 February 2026; read from extracts, check the text). Do not use it to buy time. |
| **Extension** | Up to two further months, only if the request is complex or the person has sent several. Tell them within the first month, with the reason (template R4). |
| **No fee** | Requests are free. A reasonable fee, or a refusal, is possible only for a request that is manifestly unfounded or excessive, or for further copies. The threshold "manifestly unfounded or excessive" remains after the 2025 Act (commentary; check the text). We must be able to show why, and must tell the person they can complain to the ICO or go to court (template R10). |
| **Searches** | Make reasonable and proportionate searches (Art 15(1A)). Section 5 says where to look. |
| **The privacy inbox** | Watched every working day, on the mailbox provider in placeholder 2 **[needs F1]**. |

## 3. Step by step

1. **Log it** on the day it arrives, in the request log (section 13): a request number, the date, the channel, the right asked for, and the deadline.
2. **Acknowledge it** within 2 working days (template R1). Say when to expect an answer.
3. **Check identity** proportionately (section 4). If you need a check, ask at once (template R2); the clock starts when it is done.
4. **Clarify only if needed** (template R3), and pause the clock while you wait.
5. **Check for a legal hold** on the account or the number (`law-enforcement-requests.md`). A hold changes what erasure can do now, and may affect what you can tell the person.
6. **Do the work**: gather the data (section 5), withhold what must be withheld (section 6), or carry out the erasure, correction or objection (sections 8 to 10).
7. **Send the answer** before the deadline, securely (section 7), with the right template.
8. **Close the log entry**: what was done, what was withheld and why (in general terms), the date sent. Delete our copy of any export 30 days after sending.

## 4. Identity checks

### 4.1 Principles

- **Proportionate.** Check enough to be confident the requester is the account holder, and no more. Most Resbite accounts are tied to a phone number, so the usual check is control of that number.
- **No identity documents** by default. Do not ask for a passport, driving licence or proof of address unless a case really needs it, and record why.
- **Never ask for a Resbite sign-in code.** People must learn never to share those. Our check codes are separate and say what they are for.
- **Never confirm** whether a number or email has an account until the check is done. Answer an unchecked request in neutral words (template R2).
- **Check control of the identifier the data is tied to**: the account's verified number, or its sign-in email, not the address the request came from.

### 4.2 Checks by type of requester

| Requester | Check |
|---|---|
| Any account, request sent **from the account's own sign-in email** | Usually enough for a request about the account itself. Add the phone check for a sensitive request (for example, a full export of messages). |
| Account with a **sign-in email** (email and password, Apple, Google), request from another address | Write to the sign-in email and ask the person to confirm by reply. A Sign in with Apple private relay address reaches the person only if our sending domain is registered with Apple's relay service **[needs F13, SI-10]**; otherwise use the phone check. |
| **Phone account** (the usual case), or any account with a verified number | The phone check (section 4.3). |
| **Web-only account** | The phone check. |
| **Suspended or banned account** | The same checks. A ban does not change who the person is. |
| **Person who is not a user** (an invited number) | The phone check, on the number they say was invited. |
| Someone **acting for** another person | Section 4.5. |

### 4.3 The phone check

1. Make up a six-digit check code. Do not reuse it.
2. Send it as a text message to the verified number on the account (or the number the non-user gave), through Twilio (decision AS-D5) **[needs C1]**:
   > Resbite: your code to confirm your data request is [code]. Reply to our email with it. If you did not ask us for your data, ignore this message.
3. Ask the requester to reply to our email with the code within 7 days (template R2).
4. A matching code completes the check. Record "phone check passed" and the date, never the code.
5. No reply within 7 days: send one reminder. If there is still no reply after a month, close the request as unverified (template R11).

### 4.4 A number that has changed hands

Carriers give dormant numbers to new people (SI-11). If the person who answers the phone check says the account is not theirs, or the requester can no longer receive texts on the account's number:
- **Never** give a new holder of the number the old account's data.
- If someone shows they hold the number now and says the account is not theirs, the owner may suspend the account's phone sign-in and, where the account has an email, write to the old holder. Record the reasoning.
- If the account holder has lost the number, ask for other evidence proportionate to the request: for example, details only the holder would know, such as resbites they hosted and roughly when. Decide case by case, record why, and never disclose the data to settle the check.

### 4.5 Someone acting for another person

- **A solicitor, an advocate, a family member or a rights-request service:** ask for written authority from the person, and run the person's own check (section 4.2) unless the authority makes that unnecessary.
- **A parent or carer:** Resbite is for adults only. A request from a parent about a child's account is also a report of an under-18 account: follow `moderation-standard.md` section 12. Ask for proportionate evidence of parental responsibility before disclosing anything.
- **Someone with a power of attorney or a court order:** ask for a copy, and take advice if it is unclear.

## 5. What to export, from where

Export for one account (its account id and verified number) or one number (for a non-user). Two owner-run, read-only scripts do this (C6, local only until `20261117130000_retention_and_team_tools.sql` and plan 4's `20261117120000_terms_acceptance.sql` are applied; rollout in `qa/retention-and-team-tools-2026-11-17/README.md`):
- **`supabase/ops/export-account.sql`**, for an account. It prints `export`, the JSON to send, one key per source below, and `files`, the Storage paths of the person's profile photos and covers to download for the archive. The JSON holds no id but the person's own, other people's numbers only as their last two digits, the person's own messages only, Resbite's chat lines that name them without the payload (so nobody else is named), and never a reporter, a reporter's words, a review note, or a block or "Not now" of the person by anyone (section 6).
- **`supabase/ops/export-number.sql`**, for a number that is not a user's (section 5.9).

Each is run only after the identity check (section 4) and `supabase/ops/legal-holds.sql`, on a private copy outside the repo with the id or number typed into the copy only, and its output is kept outside the repo. Until they are live, the owner gathers the rows by hand in the SQL editor, read-only, and does not save the queries.

At 1.0 the optional date of birth, second phone, city and interests are no longer stored (decision D-9) **[needs B11, C9]**. If any remain in `raw_user_meta_data.registration_details`, include them.

### 5.1 Account and sign-in (Supabase Auth)

| Source | Include | Leave out |
|---|---|---|
| `auth.users` | Account id; verified phone; sign-in email; created; last sign-in; when the email and phone were confirmed; any ban and its end; `raw_user_meta_data.display_name` | The password hash; tokens |
| `auth.identities` | Each linked sign-in method (phone, email, Apple, Google), when linked, and its email | Provider tokens |
| `auth.sessions` | Each current session: created, last used, the device's user agent, the IP address | Refresh tokens |
| Auth audit log (Supabase log store, 7 days) | Only if the person asks for it and it is still held | — |

### 5.2 Profile and access records

| Source | Include | Leave out |
|---|---|---|
| `public.profiles` | Display name; when created; whether deletion was requested | `avatar_revision` (a counter) |
| Storage bucket `profile-photos`, folder named by the account id | The current profile photo file | — |
| `private.age_attestations` | When the 18+ tick was given; the Terms version; the method | — |
| Per-version Terms acceptance **[needs C8]** | Each Terms version accepted and when | — |
| `private.chat_rules_acceptances` | Each chat rules version accepted and when | — |
| `private.app_sessions` | First and last time the app was used | — |
| `private.beta_access` | Access grants: how granted, when, and when revoked | — |
| `private.tester_roster` | Whether the sign-in email is on the old tester list, and whether enabled (if the table still has rows, C3) | — |
| `private.suspensions` | That the account was suspended, and when | `report_id`: it leads to a report and its reporter |
| `private.moderators` | Whether the account is a moderator | — |
| `private.lookup_usage` | The day and count of contact lookups | — |
| `private.device_endpoints` | Each push registration: platform and date; the token shortened to its first and last four characters | The full token, unless asked |
| `private.phone_rewrites` | The old and new number and when, if the account was rewritten (if the table still exists) | — |
| `private.account_deletion_jobs` | Status and dates of a deletion request **[needs C2]** | `recovery_hash` |

### 5.3 Resbites and taking part

| Source | Include | Leave out |
|---|---|---|
| `public.plans` the person owns (`owner_id`) | Title; description; categories; start, end and time zone; meeting place (`place_label`); the area shown before replying; note; note to guests and its time; cover description; status; repeat rule; circle settings (`bring_invites`, `bring_levels`); created | Latitude and longitude (never sent by the app) |
| Storage bucket `plan-covers`, folder named by the account id | Cover photos they uploaded | — |
| `public.plan_meeting_details` for resbites they own | The meeting details text | — |
| Guest lists of resbites they host (`public.attendees`) | Each guest's display name and answer, as the host already sees them in the app | Guests' ids and numbers |
| `public.attendees` where they are the guest | Each resbite's title and date; their answer and when; their level; the display name of the person who brought them | The bringer's id |
| `public.plan_admins` | Resbites where they are a co-host, who appointed them (display name) and when; co-hosts they appointed (display names) | Ids |
| `private.join_requests` | Each request to join by link: resbite, answer, status, when asked, when decided | — |
| `private.plan_removals` (by account id or their number) | That a host removed them from a series, which resbite, and when | — |
| `private.series_leaves` | Groups they left, and when | — |
| `public.plan_mutes`, `public.chat_mutes` | What they muted, and when | — |

### 5.4 Invitations by number and links

| Source | Include | Leave out |
|---|---|---|
| `private.phone_invitations` they sent (`invited_by` or `brought_by`) | For each: the resbite, the calling code, the number shown as its last two digits, when sent, answered or revoked, the level | Full numbers of other people (the host already holds them in their own contacts) |
| `private.phone_invitations` to them (`user_id`, or the number) | For each: the resbite's title and date, the inviting host's display name (shown on the invitation page), when sent, answered or revoked | The inviter's id and number |
| `private.plan_links` for resbites they own | That a link existed, when made and when turned off | The link code |
| `private.invitations` (legacy) | Any row they claimed or that names their email (if the table still has rows, C3) | Token hashes |
| `private.link_opens` | Nothing: it holds a link and a time, and identifies nobody | — |

### 5.5 Chat

| Source | Include | Leave out |
|---|---|---|
| `public.messages` they wrote (`author_id`, kind `message` or `announcement`) | Each message's words, time, state (sent, deleted or removed), kind, audience, and the resbite | Words of removed or deleted messages are gone; say so |
| `public.messages` system lines that name them (`payload`) | The event and time (`chat_events` in `export-account.sql`), without the payload, so no other person is named | Other people's ids |
| `public.chat_reads` | Their read position in each chat | — |
| Other people's messages and whole chats | **Never** (section 6) | — |

### 5.6 Connections and safety

| Source | Include | Withhold |
|---|---|---|
| `public.connections` | Each connection or request: the other person's display name, whether connected, who asked, the resbite where they met, when asked and accepted | Ids |
| `private.connection_refusals` they made (`to_user`: the table's `from_user` asked and was refused, `supabase/migrations/20261110120000_connections.sql:27`) | Their own "Not now" answers and removals: the other person's display name, the resbite, when (`refusals_made` in `export-account.sql`) | — |
| `private.connection_refusals` about them (`from_user`) | — | **All rows** (section 6.2) |
| `private.blocks` they made (`blocker_id`) | Who they blocked (display name) and when, as Blocked people shows them | — |
| `private.blocks` of them (`blocked_id`) | — | **All rows** (section 6.2) |
| `private.reports` they filed (`reporter_id`) | Reason; their own words (`details`); when; status; the reported person's display name; the reported message's frozen words, which they saw | `review_note`, which is about someone else |
| `private.reports` about them (`target_user_id` or `frozen_author`) | When; the reason category; the frozen copy of their own words; status and action; `review_note` unless it would identify the reporter | **The reporter's identity**; the reporter's `details` unless they can be shared without identifying or endangering the reporter (section 6.1) |

### 5.7 Notifications

| Source | Include | Leave out |
|---|---|---|
| `private.notification_outbox` where they are the recipient | Kind, resbite, when queued and delivered, the actor's display name, the detail (for example an answer). Kept 30 days after sending at 1.0 **[needs C3]** | The actor's id |
| `private.notification_deliveries` for those rows | Delivery state and attempts, as a summary | Ticket ids |
| Push content held by Expo or Apple | Not held by us (Expo keeps receipts for a day) | — |

### 5.8 Outside the database

| Source | Include |
|---|---|
| Support and privacy emails, and the request, complaint and moderation logs (placeholder 3) | Copies of their correspondence and our case notes about them, applying section 6 (never a reporter's identity) |
| Backups (7 days) | Not searched: they hold the same data and are overwritten within 7 days. Say so |
| Platform logs: Supabase (7 days), Vercel (hours to a day, plan UNVERIFIED) | Not searched unless the person asks for them and they are still held. Say so |
| Data on their iPhone (sign-in keys in the keychain, plan drafts) and the link site's browser session | Not held by us; on their device. Say so |

### 5.9 For a person who is not a user

`supabase/ops/export-number.sql` gathers the first three rows, matching the number by its key, so both spellings of an Argentine mobile are one number. It leaves out an invitation an account answered: that is the account's data, and a number changes hands (section 4.4).

| Source | Include |
|---|---|
| `private.phone_invitations` with their number | Each invitation: the resbite's title and date, the inviting host's display name, when sent, answered or revoked |
| `private.plan_removals` with their number | That a host's series keeps their number so a guest cannot bring them back, and since when |
| The do-not-invite list (`private.invite_objections`, D-23) | Whether their number is on it |
| Test-mode phone codes | Emptied at switch-off and then dropped **[needs C1]** |

## 6. What to withhold, and why

### 6.1 Other people's information (DPA 2018 Schedule 2, Part 3, para 16)

We need not disclose information that identifies another person, unless that person consents or it is reasonable to disclose it without consent. Weigh: the kind of information, any duty of confidence, whether we could ask the other person, whether they could consent, and any refusal.

**Standing rules for Resbite:**
- **A reporter's identity is never disclosed** to the person they reported, nor anything that would identify them. Reporting depends on it, and the app tells reporters only that "the Resbite team will look at it". Their `details` text is shared only if it can be summarised without identifying or endangering them; otherwise withhold it.
- **Other people's messages are not disclosed.** The export holds the person's own messages only, never whole chats. The frozen copy in a report the person filed is their own evidence and was already visible to them.
- **Other people's phone numbers** are shown only as their last two digits.
- **Display names** that the person could already see in the app (hosts, guests, connections, co-hosts, people they blocked) are disclosed: that is reasonable without consent.

### 6.2 Hidden choices other people made about the person

**Connection refusals** about the person ("Not now" answers and removals) and **blocks** of the person are withheld. The app promises the person asking is never told of a refusal, and that a blocked person "won't know". Disclosing them would identify the other person and could put them at risk. This is a para 16 judgement recorded once here; revisit it in a case where it may be wrong.

### 6.3 Crime and legal privilege

- **Crime (Schedule 2, Part 1, para 2).** Where disclosure would be likely to prejudice the prevention or detection of crime or the prosecution of offenders, withhold to that extent: for example, where a police request, an NCA report or a CSEA case concerns the person. Check `law-enforcement-requests.md` and ask the owner before replying. The same exemption can cover not saying that we have withheld.
- **Legal professional privilege (Schedule 2, Part 4, para 19).** Advice from the solicitor is not disclosed.

### 6.4 Telling the person

Say in general terms that some information was withheld to protect other people or for a legal reason, and that they can complain to the ICO (template R5). Do not list the categories when the list itself would reveal what was withheld (for example, "someone refused your connection"). Record in the log exactly what was withheld and the exemption.

## 7. Format and delivery

- **Format.** A machine-readable file (JSON) with the data, a short plain summary of what each part means, and the photo files. The same package serves portability (Art 20), which covers what the person gave us: their profile, photos, resbites, messages and answers.
- **Delivery.** An encrypted archive sent to the checked email address. Send the password by a different route: a text message to the verified number **[needs C1]**. Never send personal data to an address we have not checked.
- **Our copy.** Deleted 30 days after sending. The log keeps only what was sent and when.

## 8. Erasure

### 8.1 In the app first

Every account can delete itself in the app: Profile → Data & privacy → Delete account, confirming with a fresh phone code, a password, an email code or Sign in with Apple **[needs B3, C2]**. Suspended accounts can too (decision D-19) **[needs B6, C2]**. Point people there first (template R6): it is immediate, and it gives them a receipt.

### 8.2 By request, for accounts that cannot use the app

- **Who:** web-only accounts; banned accounts, which cannot sign in; anyone who has lost access to the app (https://link.resbite.com/delete-account explains it, A6) **[needs D8]**. A web-only account with no resbite in the last 12 months is deleted by the C3 job without a request (ruling AS-R4) **[needs C3]**.
- **Check** identity (section 4).
- **Check for a legal hold.**
- **Run the deletion** for that account with the owner-run deletion script, `supabase/ops/delete-account.sql`, which runs the same lifecycle as the in-app request, with the cancellations and the receipt, for banned, web-only and under-18 accounts that cannot use the app (ruling AS-R3) **[needs C2 live]**. Never delete the user from the Auth dashboard instead: it skips the cancellation pushes, the photo and cover removal, the Apple token revocation and the receipt. On the hosted schema today it also fails where the account still has guest rows (`public.attendees.user_id` has no `on delete` rule until the deletion release changes it, `supabase/migrations/20260918001316_account_deletion_lifecycle.sql:22-23`, local-only).
- **Confirm** when it is done (template R7). The promise is **within 30 days**; the target is minutes.

### 8.2a Weekly check for stuck deletions

Until the deletion worker's failure and queue-age alerts exist (F10, Step 28 of `qa/app-store-release/README.md`), the owner runs this every week in the SQL editor. The promise to people is within 30 days, and nothing else tells us when the worker has stopped.

```sql
select count(*) filter (where status in ('queued','processing') and requested_at < now() - interval '7 days') as stuck, max(attempts) filter (where status in ('queued','processing')) as max_attempts from private.account_deletion_jobs;
```

Expect `stuck` 0. Held jobs are left out on purpose. If `stuck` is more than 0, or `max_attempts` keeps rising, look at the `cleanup-account` function's logs and its last runs in `cron.job_run_details`, and fix the cause before day 30 of the oldest request. Record the check and its result in the request log. Never write an account id or number in it.

### 8.3 What a deletion removes, and what stays

**Removed** when the deletion is requested (`request_account_deletion`, `supabase/migrations/20261116120000_open_beta.sql:202-276`, carried into C2): the profile becomes "Deleted member" with no photo; future resbites the person hosts are cancelled, with a push to guests; on every resbite they host the meeting place is cleared, and the redaction trigger blanks the title, description, cover, note to guests, meeting details and area (`supabase/migrations/20261021120000_gi1_event_links.sql:188-203`); their guest rows, connections and refusals, blocks both ways, their id on the reports they filed (the reports stay, ruling AS-R2), chat rules acceptances, moderator row, read positions, mutes, push registrations and queued notifications; their messages lose their words and author. Then the clean-up worker removes their photos and covers and the Auth account itself **[needs C2]**. Sign in with Apple tokens are revoked **[needs B3, C2]**.

**Kept**, and told to the person:
- Reports about them, with the frozen copy of the reported words, until 180 days after each report is closed. A closed report forgets who it was about once the account is gone.
- Reports they filed, with their id cleared: until each is closed, then 180 days (ruling AS-R2) **[needs C2; today they are deleted with the account]**.
- The suspension record, if they were suspended, with their id cleared and the reason and dates kept: 12 months after the deletion (ruling AS-R1, with D-19; `retention-schedule.md` section 7) **[needs C2; today the record is deleted with the account, see `moderation-standard.md` section 20]**.
- Past resbites other people still see, with a neutral organiser; system lines in chats, which show them as nobody.
- The deletion receipt: 30 days after clean-up completes **[needs C2]**.
- Backups and platform logs, until they roll over after 7 days.
- Our correspondence with them: 24 months after the case closes.
- Anything under a legal hold, until the hold is lifted. The request is accepted, and erasure of the held records waits **[needs C2]**. Tell the person only that some information must be kept for a legal reason, unless the crime exemption (section 6.3) means we should not.

### 8.4 Erasure that is not a whole account

- **One item** (a photo, a message, a resbite): the person can remove it in the app. If they cannot, do it with the removal scripts, in the SQL editor's copy only (C6, local only until `20261117130000` is applied):
  - a profile photo: `supabase/ops/remove-profile-photo.sql` takes it off the profile at once, and the file goes at the photo clean-up's next run, within 10 minutes;
  - a resbite's title, description, notes or cover: `supabase/ops/remove-resbite-content.sql`, on every occurrence of the series; a cover's file goes at the next run too;
  - a message: `supabase/ops/remove-reported-message.sql` blanks its words.

  Under a legal hold, the photo or cover comes down and the file is kept (`law-enforcement-requests.md` section 11.3).
- **A non-user's number:** see section 10.2.

## 9. Correction, and changes to a number or email

- **Name and photo:** self-service in Profile.
- **The sign-in number or email** has no self-service change at 1.0 (SI-9). By request:
  1. Check control of the **current** number or email (section 4).
  2. Check control of the **new** one: the phone check to the new number, or a confirmation reply from the new email.
  3. If the new number or email already belongs to another account, stop: tell the person (without saying whose) and offer the usual Add your number route.
  4. The owner makes the change with the Auth admin tools (the dashboard, or the Admin API from the owner's shell, with `phone_confirm` for a checked number). Record it.
  5. Note that invitations already sent to the old number stay with the old number.
- **Anything else inaccurate** (for example a report the person says is wrong): record their view with the record, and decide whether to correct it. Restrict use while you decide if they ask (Art 18).

## 10. Objection, restriction and consent

### 10.1 Users

Resbite relies on legitimate interests for some processing: the contact lookup, the 18+ and Terms record, link-open counts, security logs and moderation evidence (`records-of-processing.md`). On an objection, stop unless there are compelling legitimate grounds that override the person's interests, or the data is needed for legal claims. Moderation evidence and the 18+ record usually meet that test; explain why (template R8).

Push notifications and contacts access rest on iOS permissions: the person can turn them off in the iPhone's Settings at any time. Resbite does not send marketing.

### 10.2 People who are not users

A person whose number a host picked can object (Art 21). We tell them this separately on the invitation page and in the Privacy Policy (PRV-19, A2). On an objection:
1. Check control of the number (section 4.3).
2. Run `supabase/ops/object-number.sql` with the number, in the SQL editor's copy only (C3 and C6, local only until `20261117130000` is applied). In one transaction it adds the number to the do-not-invite list (`private.invite_objections`: a keyed hash, never the number, checked by `invite_contacts`, kept until the person withdraws the objection; D-23), so no host can invite it by link again. Invite people then reads "Can’t be invited by link". A person on Resbite who holds that number is still invited in the app (LI-4).
3. The same run deletes every invitation by number to it and every removal record of it, for every host, except those a legal hold keeps. It prints counts only (`invitations_deleted`, `removals_deleted`, `held_kept`). If a host was inviting at that moment, run it again a minute later. Once a hold is lifted, run it again to delete what the hold kept.
4. Confirm (template R9). Do not tell them which host invited them beyond what the invitation already showed.
5. **Withdrawing the objection:** after the phone check, `supabase/ops/withdraw-objection.sql` takes the number off the list, and hosts may invite it by link again.

### 10.3 Restriction (Art 18)

There is no restriction switch. Handle each case: mark it in the request log, and keep the data from being used or deleted until it is resolved. A legal hold (`law-enforcement-requests.md`) can keep data from deletion if needed.

## 11. Requests that are something else

- A complaint about how we handle data: the complaints procedure (A5), acknowledged within 30 days.
- A report about content: `moderation-standard.md`, the same day.
- A request from the police or another authority: `law-enforcement-requests.md`.
- Something that suggests a breach (for example, "someone else is using my account"): `breach-response.md` at once.

## 12. Who does this

The owner handles every data request. The backup moderator does not have the privacy inbox and does not handle requests (`team-access.md`). If something urgent arrives at the support inbox while the owner is away, the backup forwards it to privacy@resbite.com and tells the owner.

## 13. The request log

Kept outside the repo, in the log tool (placeholder 3). One row per request:

| Field | Content |
|---|---|
| Request number | DR-YYYY-NNN |
| Received | Date, channel |
| Right | Access, erasure, correction, objection, restriction, portability |
| Requester type | User, web-only, suspended, banned, non-user, representative |
| Identity check | Method and date passed, or why none was needed |
| Clock | Deadline; any pause (dates and reason); any extension (date told, reason) |
| Hold | Whether a legal hold applied |
| Outcome | What was done; what was withheld and under which exemption |
| Sent | Date and route |
| Closed | Date; the date the row is due for deletion (24 months after closing) |

## 14. Reply templates

Every email ends with this signature (company particulars, DOC-7):

> Resbite Ltd · Registered in England and Wales, company number 12450334 · Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom · VAT number: [[OWNER: VAT number, or delete if not VAT-registered]] · privacy@resbite.com

Square brackets mark the parts to fill in.

### R1. Acknowledgement

> **Subject:** Your data request [DR-number]
>
> Hello,
>
> We received your request on [date]. [We need to check it is you first: see our next email.] We will answer by [deadline]. If you have any questions, reply to this email.
>
> Resbite
>
> [Signature]

### R2. Identity check

> **Subject:** Your data request [DR-number]: please confirm it is you
>
> Hello,
>
> To protect your information, we need to check that this request comes from the person it is about. [We have sent a six-digit code by text message to the phone number on the Resbite account. / We have sent an email to the sign-in address on the Resbite account.] Please reply to this email with [the code / confirmation from that address] within 7 days.
>
> If there is no Resbite account for that number or email, we will tell you that we hold no data.
>
> We will never ask for the code Resbite sends you to sign in. Do not share that code with anyone.
>
> Resbite
>
> [Signature]

### R3. Clarification

> We need a little more information before we can answer: [what, and why]. Your one-month time limit is paused from today until we hear from you.

### R4. Extension

> Your request needs more time because [it is complex / you have sent several requests]. We will answer by [new date], within the extra two months the law allows.

### R5. Access response

> **Subject:** Your Resbite data [DR-number]
>
> Hello,
>
> Attached is a copy of the personal data Resbite holds about you, sent as an encrypted file. We have sent the password by text message to the phone number on your account.
>
> The file includes your account and sign-in details, your profile and photo, your resbites and answers, invitations, your own chat messages, connections, blocks you made, reports you sent, reports about you (without the identity of whoever made them), and notifications.
>
> **Why we hold it, who we share it with and how long we keep it** are in our Privacy Policy: https://link.resbite.com/privacy
>
> [**Some information was withheld**, to protect other people's privacy or for a legal reason allowed by the Data Protection Act 2018.]
>
> Backups and system logs are kept for 7 days and were not searched. Information stored on your own iPhone is not held by us.
>
> If you are unhappy with this answer, reply to this email, or see our complaints procedure: https://link.resbite.com/support. You can also complain to the Information Commission (ICO): ico.org.uk.
>
> Resbite
>
> [Signature]

### R6. Erasure: use the app

> You can delete your account straight away in the app: Profile → Data & privacy → Delete account. You will confirm it with a code or your password, and the app will show you what happens next. If you cannot get into the app, reply to this email and we will do it for you.

### R7. Erasure confirmation

> **Subject:** Your Resbite account has been deleted [DR-number]
>
> Hello,
>
> We deleted your Resbite account on [date]. Your profile, photos, invitations, connections and push registrations are gone, and your chat messages no longer show your words or your name.
>
> **What we keep, and for how long:** reports other people made about you, until 180 days after we closed each one; [a record that the account was suspended, for 12 months after the deletion;] a short deletion record, for 30 days; our emails with you, for 24 months. Backups and system logs roll over within 7 days. [We must keep some other information for a legal reason, and will delete it when that reason ends.]
>
> Resbite
>
> [Signature]

### R8. Objection: user

> We have looked at your objection to [the processing]. [We have stopped it.] [We will keep [the data], because [the compelling legitimate grounds, for example: we need reports to keep people safe and to meet our legal duties under the Online Safety Act].] You can complain to the Information Commission (ICO): ico.org.uk.

### R9. Objection: person who is not a user

> **Subject:** Your number will not be invited again
>
> Hello,
>
> We have added your number to our do-not-invite list, so nobody can invite you through Resbite again. We have deleted the invitations we held for it. We keep the number only in a scrambled form, for as long as you want to stay on the list. To come off it, write to privacy@resbite.com.
>
> Resbite
>
> [Signature]

### R10. Refusal or fee

> We are not able to [answer this request / answer it without a fee of £[amount]], because it is [manifestly unfounded / excessive]: [the reason]. You can complain to the Information Commission (ICO) at ico.org.uk, or ask a court to decide.

### R11. Unverified

> We have not been able to confirm that this request comes from the account holder, so we have not acted on it. If you are the account holder, reply to this email and we will try another way.

### R12. Correction done

> We have updated [what] on your account on [date].

## 15. What must be built for this procedure to work in full

| Item | What this procedure needs from it |
|---|---|
| B3, C2 | In-app deletion for every account type, within 30 days, with Apple token revocation and receipts; the legal hold in deletion; deletion while suspended (D-19); keeping the suspension record after deletion, with the id cleared (AS-R1); keeping a deleted reporter's reports, with the id cleared (AS-R2) |
| B6 | Delete account on the suspended screen |
| B11, C9 | The optional details removed and erased |
| B14 | "Request a copy of my data" in the app |
| C1 | Twilio, for the phone check and archive passwords; the test-code tables dropped |
| C3 | The suspension, outbox and other retention jobs, including web-only accounts after 12 months without a resbite (AS-R4); the do-not-invite list. Built locally in `20261117130000_retention_and_team_tools.sql`, not applied |
| C6 | The owner-run deletion script for banned, web-only and under-18 accounts (AS-R3; plan 2's `delete-account.sql`); the exports `export-account.sql` and `export-number.sql` (own messages only, never a reporter's id, no other person named); the removal scripts `remove-profile-photo.sql` and `remove-resbite-content.sql`; `object-number.sql`, which honours a non-user's objection, and `withdraw-objection.sql`. Built locally in `supabase/ops/`, not live: they need `20261117130000` applied |
| C8 | Per-version Terms acceptance |
| D1, D8 | /support with the contact form; /delete-account with the request route |
| F1, F3 | The inboxes; the request log |
| F13 | Apple's private relay registration, to reach relay addresses |

## 16. Sources

- UK GDPR Arts 12A, 15 to 21, as amended by the Data (Use and Access) Act 2025 ss.75 to 79 (text not read: legislation.gov.uk refused automated reads; summarised from the law report and secondary commentary): https://www.legislation.gov.uk/ukpga/2025/18/section/76
- GOV.UK, Data (Use and Access) Act 2025: data protection and privacy changes ("stop the clock"; reasonable and proportionate searches; complaints) (read directly): https://www.gov.uk/guidance/data-use-and-access-act-2025-data-protection-and-privacy-changes
- ICO, A guide to subject access (x): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/subject-access-requests/a-guide-to-subject-access/
- DPA 2018 Schedule 2, Part 1 para 2, Part 3 para 16, Part 4 para 19 (text not re-read): https://www.legislation.gov.uk/ukpga/2018/12/schedule/2
- DPA 2018 s.164A, complaints to controllers (x): https://www.legislation.gov.uk/ukpga/2018/12/section/164A
- Apple, Offering account deletion in your app: https://developer.apple.com/support/offering-account-deletion-in-your-app/

(x) means read only through search-engine extracts, because the site refused automated reads.
