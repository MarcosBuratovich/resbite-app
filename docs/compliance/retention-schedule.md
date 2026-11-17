# Retention schedule

| | |
|---|---|
| **Owner** | The owner, for Resbite Ltd |
| **Version** | 1.0 — draft for solicitor review (decision D-12), not yet adopted |
| **Date** | 17 November 2026 |
| **Next review** | Before the 1.0 submission, then no later than 17 November 2027, and before any new table, store or vendor (F15) |
| **Purpose** | How long Resbite Ltd keeps each kind of personal data, what starts the clock, what deletes it, whether that deletion is built yet, and how a legal hold pauses it. |

This is an internal record (A12). It holds no personal data. It is not legal advice. A UK solicitor reviews it with the public documents before launch (decision D-12). The Privacy Policy (A1) and the "How to delete your account" page (A6) state the public periods from this schedule.

**What it describes.** Resbite as it will be at version 1.0, after workstreams B, C and D of the gap analysis are built, using the owner's answers and the rulings of 17 November 2026 (AS-D1 to AS-D8 and AS-R1 to AS-R9 in `knowledge-base/08-decisions.md`) and, where they say nothing, the recommended defaults of decision D-8 (the retention table in section 5 of `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`) and of D-3 to D-25. The "Built?" column says what exists today, so the gap is visible. Where the code and the gap analysis disagree, the code is followed and a note says so.

## Placeholders to fill

1. [[OWNER: Vercel plan for the link site, which sets how long its request logs last — proposed: Pro, which keeps request logs for 1 day and is covered by Vercel's data processing agreement]]
2. [[OWNER: how long Twilio keeps message records — proposed: the Send SMS hook deletes each message record through Twilio's API once its delivery status is final, and Twilio says a deleted message's text can stay in its backups for up to 30 days, so state "up to 31 days after sending"; Twilio's Message Redaction setting is offered only with its Editions packages]]
3. [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]]
4. [[OWNER: mailbox provider for support@resbite.com and privacy@resbite.com — proposed: a business email service under a signed data processing agreement, with data held in the UK or EU and MFA on]]
5. [[OWNER: tool that holds the moderation, request, complaint, breach and law-enforcement logs — proposed: one access-controlled spreadsheet in the mailbox provider's business workspace, under the same data processing agreement]]
6. [[OWNER: how long to keep breach log entries — proposed: six years after each breach is closed, with entries holding no names, numbers or account ids]]
7. [[OWNER: how long to keep a signed A24 after the person's access ends — proposed: six years, the usual limitation period for contract claims in England and Wales]]

## The rules

1. **Every store has a period.** No personal data is kept "forever". If a new table or store appears without a line here, it must not go live.
2. **Deleting means deleting.** A job removes the row or the file. Where a row must stay for others, such as a chat message in a shared conversation, the personal content is blanked and the author removed, and the empty row goes when the conversation's own period ends.
3. **Jobs run daily.** C3 adds one migration with purge functions and one cron script; C2 adds the deletion worker and the receipt purge. Each run logs only counts, never ids.
4. **Backups and platform logs roll off in 7 days.** They cannot be edited row by row. So data deleted from the live database can survive up to 7 days in a backup. A restore replays deletions from the receipts before the app reopens **[needs C2, F11]**.
5. **A legal hold pauses deletion** of the records it names, and nothing else (section 15).
6. **Account deletion** is started in the app for every account type and completed within 30 days, aiming for minutes (D-4) **[needs B3, C2]**. Web-only and banned accounts ask through privacy@resbite.com or the contact form, and the same 30 days apply; the owner-run deletion script runs the same lifecycle as the app, with the cancellations and the receipt (ruling AS-R3) **[needs D8, A16, C6]**. A web-only account with no resbite in the last 12 months is deleted by the C3 job, and a code request that is never confirmed is kept 30 days (ruling AS-R4) **[needs C3]**. A suspended account can delete in the app (D-19). Section 16 lists what deletion removes and what it keeps.
7. **Changes** to a period go through the owner, are recorded in `knowledge-base/08-decisions.md` (A19), and are mirrored in A1, A6, the in-app Data & privacy page (B5) and the App Privacy answers (E3).

## How to read the tables

- **Period:** how long the data is kept. "D-8" means the period comes from the gap analysis' default table.
- **Clock starts:** the event that starts the period.
- **Deleted by:** the job, script, cascade or platform that deletes it.
- **Built?** **Live** (on the hosted project today); **Live (manual)** (an owner-run script exists); **Local only — C2** (written, not deployed); **Not built — C3** (to build); **Platform** (the vendor deletes it).
- **Hold:** **Pauses** means the job checks the legal hold. **Export** means the store cannot be paused, so held records must be copied out before they roll off (section 15).

---

## 1. Supabase Auth (managed by Supabase)

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| `auth.users`, a code request never confirmed | The phone number given, request times | 30 days (AS-R4) | The code request | C3 job | Not built — C3 | — |
| `auth.users` | Phone, email, password hash, display name in metadata, confirmation and sign-in times, ban state | While the account exists | Account deletion | `cleanup-account` deletes the Auth user | Local only — C2 (source gate off, `supabase/functions/_shared/deletion-release.ts:4`) | Pauses |
| `auth.users` metadata `registration_details` | Optional date of birth, second phone, city, interests | None: removed for 1.0 (D-9) | At once | A one-off migration clears every stored value; the fields leave the app | Not built — C9, B11 | — |
| `auth.identities` | Apple and Google ids, email, name, Google picture URL | While the account exists | Account deletion | Removed with the Auth user; Apple tokens revoked first | Local only — C2; revocation not built (B3, C2) | Pauses |
| `auth.sessions`, `auth.refresh_tokens` | IP address, user agent, times | Until sign-out, expiry or account deletion | Sign-out or deletion | Supabase Auth; a deletion request ends every session | Platform (row lifetime is Supabase's, UNVERIFIED) | Export |
| One-time codes | Phone and email codes | Until used or expired. Email: 600 seconds (`qa/auth-readiness.md`, 22 October section). Phone: confirm (C11) | Code sent | Supabase Auth | Platform | — |
| `auth.audit_log_entries` | — | Not written: the database copy is off (`qa/b0-retention-proposal.md:25`). Auth events sit in the log store (section 12) | — | — | — | — |

## 2. Accounts, access and acceptance records

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| `public.profiles` | Display name, photo path, photo revision, deletion flag | While the account exists (D-8) | Account deletion | Blanked to "Deleted member" at the request (`supabase/migrations/20261116120000_open_beta.sql:231`); row removed with the Auth user | Local only — C2 | Pauses |
| `private.age_attestations` and the versioned Terms record | 18+ and Terms confirmation: time, version, method | While the account exists (D-8) | Account deletion | Cascade with the Auth user | Versioned record not built — C8; deletion C2 | Pauses |
| `private.chat_rules_acceptances` | Chat rules version and time | While the account exists | Account deletion | Deleted by the deletion request (`open_beta.sql:256`) | Local only — C2 | Pauses |
| `private.app_sessions` | First and last app session | While the account exists (D-8) | Account deletion | Cascade with the Auth user | Local only — C2 | Pauses |
| `private.beta_access` | Access grant; a revoked grant is the suspension lever since the open beta | While the account exists | Account deletion | Cascade with the Auth user | Local only — C2 | Pauses |
| `private.lookup_usage` | One row per host: today's lookup count | While the account exists; overwritten daily | Account deletion | Cascade with the Auth user | Live (cascade); deletion C2 | — |
| `private.moderators` | Moderators' account ids | While the person moderates | Offboarding or account deletion | `supabase/ops/moderators.sql`; cascade | Live (manual) | — |
| Web-only accounts (made on the link site; the app never used) | The account's number, name, answers and 18+ and Terms record | 12 months with no resbite (AS-R4) | The end of the last resbite the account took part in | C3 job, through the same deletion lifecycle as the app (AS-R3) | Not built — C3, C6 | Pauses |
| `private.tester_roster` | Old beta testers' emails | Delete once no longer needed (D-8) | 1.0 release | One-off delete in C3, after `supabase/ops/suspend-account.sql` stops touching the roster (`:18-19`) | Not built — C3 | — |
| `private.phone_rewrites` | Old and new numbers from the Argentine rewrite script | Delete once no longer needed (D-8) | C12's decision | One-off delete in C3 | Not built — C3, C12 (whether the table holds rows is UNVERIFIED) | — |

## 3. Resbites

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| `public.plans` | Title, description, times, exact place, area, note to guests, cover path and description | 12 months (D-8) | A one-off's end, or a series' last occurrence | C3 job | Not built — C3 | Pauses |
| `public.attendees` | Guest rows, answers, who brought whom | As plans (D-8) | As plans | Cascade with the plan; the deletion request removes the person's own rows (`open_beta.sql:269`) | Not built — C3; deletion C2 | Pauses |
| `public.plan_meeting_details` | Door codes, directions | As plans (D-8) | As plans | Cascade with the plan | Not built — C3 | Pauses |
| `public.plan_admins` | Co-hosts and who appointed them | As plans (D-8) | As plans | Cascade with the plan | Not built — C3 | Pauses |
| `private.join_requests` | Requests by link, answer, status, times | As plans (D-8) | As plans | Cascade with the plan; cascade with the Auth user | Not built — C3 | Pauses |
| `private.plan_links` | Link codes | As plans | As plans | Cascade with the plan | Not built — C3 | — |
| `public.plan_mutes` | Who muted a series | As plans (D-8) | A series' last occurrence | C3 job, by series (no foreign key to plans) | Not built — C3 | — |
| `private.series_leaves` | Who left a group | As plans (proposed: not in the D-8 table) | A series' last occurrence | C3 job, by series | Not built — C3 | — |
| Storage `plan-covers`, current cover | Cover image | With its plan | Plan deleted | C3 job must remove the file too: a database cascade never removes a Storage object | Not built — C3 | Pauses |
| Storage `plan-covers`, replaced or detached | Old cover images | 7 days unattached (D-8; `qa/b0-retention-proposal.md:12`) | Detached | New C3 cover worker. There is no delete policy today (`supabase/migrations/20261007200000_plan_covers.sql:63-64`) | Not built — C3 | Pauses |

When a host deletes their account, their future resbites are cancelled with a push to every guest, and the place is cleared on all their resbites (`open_beta.sql:233-242`; D-20). Because the profile is marked as deleting first, the redaction trigger also blanks the title, description, cover and cover description, note to guests, meeting details and area of each of those resbites (`private.redact_deleting_owner_plan`, `supabase/migrations/20261021120000_gi1_event_links.sql:188-203`). A group with co-hosts ends; it is not handed over in 1.0. The blank and cancelled resbites then follow the 12-month period.

## 4. Invitations and other people's numbers

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| `private.phone_invitations` | A non-user's number and calling code, code hash, who invited, who answered and when, wrong-number counter | Until answered or revoked, or 30 days after the resbite ends, whichever comes first (D-8) | Answer, revocation, or the resbite's end | C3 job | Not built — C3 | Pauses |
| `private.plan_removals`, number rows | Removed non-user's number per series | 30 days after a one-off ends; 90 days after a series' last occurrence (D-8) | The end | C3 job | Not built — C3 | Pauses |
| `private.plan_removals`, account rows | Removed user's account id per series | Same as number rows (proposed: the D-8 table names only numbers) | The end | C3 job; the deletion request removes the person's rows (`open_beta.sql:249`) | Not built — C3 | Pauses |
| Objection suppression list (new table) | Keyed hash of an objecting number; date | Until the person withdraws the objection (D-23) | Withdrawal | By hand, on request | Not built — C3 | — |
| Contact lookup | — | Not stored: only the daily count above | — | — | Live | — |

**Code note.** `phone_invitations.phone` is `not null` (`supabase/migrations/20261028120000_contact_invitations.sql:15`). To end the number at answer or revocation, C3 deletes the row, or first makes the column nullable. Revoking today keeps the number (`:9-11`), and plans are never deleted, so the cascade never fires.

## 5. Chat

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| `public.messages`, one-off resbites | Messages and announcements, author, time; system lines naming account ids | 90 days (D-8) | The chat closes (48 hours after the end) | C3 job | Not built — C3 | Pauses |
| `public.messages`, groups | As above | Messages older than 12 months (D-8) | Each message's time | C3 job | Not built — C3 | Pauses |
| `public.messages`, deleted or removed messages | None left: the text is blanked, the row stays | Until the row's own period ends | — | `delete_message` and `remove_message` blank the text (`supabase/migrations/20261111140000_chat_core.sql:573-607`) | Live | — |
| `public.messages`, a deleted account's messages | None left: text and author blanked | Until the row's own period ends | Account deletion | The deletion request (`open_beta.sql:265`) | Local only — C2 | Pauses |
| `public.chats` | No personal content (counts and last message id) | With the series | A series' last occurrence | C3 job | Not built — C3 | — |
| `public.chat_reads` | Read position | With the series' messages (proposed: not in the D-8 table) | As messages | C3 job; the deletion request (`open_beta.sql:267`) | Not built — C3 | — |
| `public.chat_mutes` | Who muted a chat | As plans (D-8, "mutes") | A series' last occurrence | C3 job; the deletion request | Not built — C3 | — |
| Realtime signals | Ids only | Transient | — | Supabase Realtime | Live | — |

## 6. Connections

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| `public.connections`, connected | The pair, who asked, where they met, times | While both accounts exist or until removed (D-8) | Removal or deletion | Removing the connection; the deletion request (`open_beta.sql:244`) | Live (removal); deletion C2 | Pauses |
| `public.connections`, unanswered requests | As above | 90 days (D-8) | The request | C3 job | Not built — C3 | — |
| `private.connection_refusals` | "Not now" answers and removals, per resbite, with the hidden flag | 12 months (D-8) | The refusal | C3 job; an acceptance clears the pair's refusals; the deletion request (`open_beta.sql:245`) | Not built — C3 | Pauses |

## 7. Safety

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| `private.reports`, open | Reporter, reported person or message, reason, details, frozen words and author, review note | Until closed. No limit while open | — | — | — | Pauses |
| `private.reports`, closed | As above | 180 days (decided, R-Q3) | Closing | C3 job, replacing `supabase/ops/purge-closed-reports.sql` | Live (manual); job not built — C3 | Pauses |
| `private.reports` filed by a person who deletes their account | As above, with the reporter id cleared | Kept until closed, then 180 days, like any report (AS-R2). The deletion request clears the reporter id instead of deleting the report. Today it deletes them, open or closed (`open_beta.sql:255`) | Closing | C3 job | Not built — C2 (clear the id), C3 | Pauses |
| `private.suspensions` | Suspended account, report, reason, what changed, time | While suspended, then 12 months after it is lifted (D-8). If the account is deleted, the user id is cleared and the reason and the dates stay, for 12 months after the deletion (AS-R1, with D-19) | The lift, or the account's deletion | C3 job | Not built — C2, C3, C6 (see the code note) | Pauses |
| `private.blocks` | Blocker, blocked person, time | Until undone (D-8) | Unblock, or either account's deletion | The blocker; the deletion request (`open_beta.sql:254`) | Live; deletion C2 | — |
| `private.blocked_terms` | None: a word list | — | — | — | — | — |
| Evidence preserved for the NCA or the police | Removed content and its context | Only under a legal hold, until the authority says it is no longer needed | Hold lifted | By hand, after the hold is lifted | Not built — C6, A22 | — |
| Reports, complaints and evidence sent by email or the web form | As sent | 24 months after the case closes (section 14) | Case closed | By hand | Not built — F1, F2, D1 | Pauses |

**Code note on suspensions.** The code does not yet support "12 months after being lifted". The undo, meant for a suspension made in error, deletes the record at once (`supabase/ops/suspend-account.sql:33-38`), and the record cascades away with the Auth user (`supabase/migrations/20261111160000_chat_safety.sql:795`). So: a lift after a successful appeal needs a script that records the lift date instead of deleting the row (C6); an error undo can keep deleting, so a mistake leaves no record; and C2 must keep the record when the account is deleted, clearing the user id and keeping the reason and the dates for 12 months (ruling AS-R1; D-19). Today the row goes with the Auth user. The table is keyed on the user id, and the reason lives only in the linked report, which is purged 180 days after closing, so C2 gives the row its own key and stores the reason in it.

## 8. Notifications

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| `private.device_endpoints` | Expo push token, platform, time | Until sign-out, until Expo reports the token invalid, or account deletion | Any of those | Sign-out; the sender; the deletion request (`open_beta.sql:270`) | Live; deletion C2 | — |
| `private.notification_outbox` | Recipient, kind, resbite, actor, detail, message id, times | 30 days (D-8). `invited` rows stay while the invitation is pending, because the block rule reads them (DI-09) | Sent | C3 job; the deletion request removes the person's own rows (`open_beta.sql:271`) | Not built — C3 | — |
| `private.notification_deliveries` | Token copy, state, Expo ticket id | 30 days (D-8) | Sent | Cascade with the outbox row; C3 job | Not built — C3 | — |
| Push content at Expo | Titles and bodies, including chat text | Not stored by Expo ("never stored"); receipts 24 hours | Sent | Expo | Platform | — |
| Local reminders and calendar entries | Event title and time | On the person's phone (section 13) | — | — | — | — |

## 9. Account deletion records

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| `private.account_deletion_jobs` | Request id, account id, hash of the recovery secret, status, times | 30 days after clean-up completes (D-8) | Clean-up complete | `purge-deletion-receipts` (`supabase/migrations/20260923152943_deletion_receipt_retention.sql`) | Local only — C2 | — |
| `private.deletion_intent_reservations` | Request id, account id, project ref, hash of the recovery secret | Proposed: with the receipt, 30 days after clean-up. The local code never deletes it | Clean-up complete | C2 must add the purge | Not built — C2 | — |
| `private.profile_photo_cleanup_jobs` | Account id, photo path, times | Completed jobs: 30 days | Completed | The clean-up function (`supabase/migrations/20260923152816_orphan_profile_photo_cleanup.sql:168-169`) | Local only — C3 | — |
| `private.profile_photo_retired_paths` | Account id, hash of an old path | While the Auth account exists | Account deletion completes | Account clean-up (`orphan_profile_photo_cleanup.sql:183-184`) | Local only — C2, C3 | — |

## 10. Test mode and leftovers

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| `private.test_codes` | Full numbers and their codes | Emptied at switch-off; table dropped after the log review (D-8) | Switch-off | C1 sitting; a later migration drops it | Not built — C1 | — |
| `private.test_mode_log` | Last two digits, account id, event, time | Dropped after the log review. The review's outcome goes into the breach log, whatever it finds (F5) | Log review done | C1; later migration | Not built — C1, F5 | Export (to the breach review) |
| `private.invitations` (legacy) | Token hash, intended email | Delete once no longer needed (D-8) | 1.0 release | One-off delete in C3 | Not built — C3 | — |
| `private.phone_mode` | None: a switch | — | — | — | — | — |

## 11. Storage: profile photos

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| `profile-photos`, current photo | Profile image | While the account exists | Account deletion | `cleanup-account` | Local only — C2 | Pauses |
| `profile-photos`, replaced or removed | Old profile images | 7 days unattached (D-8) | Detached | `cleanup-profile-photos` (gate at `supabase/functions/cleanup-profile-photos/index.ts:9`) | Local only — C3 | Pauses |
| A photo removed by a moderator | Profile image | Deleted at removal; kept only under a legal hold | Removal | C6 removal script | Not built — C6 | Pauses |

## 12. Logs, backups and vendors' own copies

| Store | Personal data | Period | Deleted by | Built? | Hold |
|---|---|---|---|---|---|
| Supabase logs: API, database, Auth, Storage, Realtime, Edge Functions | Paths, account id in the token subject; IP and user agent in API logs UNVERIFIED | 7 days (Pro) | Platform | Platform | Export |
| Supabase backups | Everything in the database; Storage metadata, not files | 7 daily backups; point-in-time recovery off (D-15) | Platform | Platform | Export |
| Vercel request logs (link site) | Path with the link code, search parameters, user agent, region | 1 hour (Hobby), 1 day (Pro), 30 days with Observability Plus. Placeholder 1 | Platform | Platform | Export |
| Vercel function handling the contact form | Message passes through to the support inbox; not stored by the site | Transient | — | Not built — D1 | — |
| Expo: stored push tokens | Push token | Expo's own period (not published, UNVERIFIED) | Expo | Platform; confirm under F7 | — |
| Resend: sent-email logs | Address, subject, delivery events | 30 days: Resend states it keeps email and log data for 30 days on its Free, Pro and Scale plans (https://resend.com/security/gdpr, read 17 November 2026). Confirm the plan under F7 | Resend | Platform; confirm under F7 | Export |
| Twilio: message records | Number, code text, delivery status | Placeholder 2. Twilio keeps them until we delete them; a deleted message's text can stay in its backups for up to 30 days (`vendors.md`, Twilio) | The Send SMS hook, through Twilio's API; then Twilio's backups | Not built — C1, F7 | Export |
| CAPTCHA vendor: signals | IP, browser and device signals | The vendor's own period (Turnstile's addendum states none). Placeholder 3 | Vendor | Not built — B16, D10, F7 | — |
| Apple and Google | Their own account data | Their own periods, as independent controllers | — | — | — |

## 13. On the person's phone and in their browser (not held by Resbite)

Listed so that A1 and A6 can explain them.

| Where | What | Kept until |
|---|---|---|
| iOS Keychain: session, people and groups, invite codes, recent places, chat queue, reminder settings, calendar records, photo upload queue, pending email, push endpoint, deletion receipt | Tokens, contact names and numbers the host saved, places, unsent messages | Sign-out clears them (`mobile/src/services/sessionLifecycle.ts:22-40`). Keychain items can survive deleting the app (DI-22) |
| Plan drafts (`resbite.create-journal.v1.<account>`) | Unfinished titles, descriptions, places, notes | Kept after sign-out by design; Discard removes them |
| Link site `localStorage` (`resbite.personal.session.<code>`) | Tokens, the full verified number, the event start | Dropped when the event starts, on "Not you? Sign out", or when unreadable (`links/assets/personal-flow.mjs:380-478`) |

## 14. Held by Resbite outside the repo

| Store | Personal data | Period | Clock starts | Deleted by | Built? | Hold |
|---|---|---|---|---|---|---|
| Support inbox (placeholder 4) | Emails, contact-form messages, attachments | 24 months (D-8) | Case closed | By hand, monthly | Not built — F1, D1 | Pauses |
| Privacy inbox (placeholder 4) | Requests, identity checks, complaints | 24 months (D-8) | Case closed | By hand, monthly | Not built — F1 | Pauses |
| Request log and complaints log (placeholder 5) | Case summaries and outcomes | 24 months (D-8) | Case closed | By hand, monthly | Not built — F3, F4 | Pauses |
| Law-enforcement request log (placeholder 5) | Request, legal basis, officer's work contact, what was disclosed | 24 months, longer under a hold (D-8) | Case closed | By hand | Not built — F17, A22 | Pauses |
| Breach log (placeholder 5) | What happened, the decision, the reasons; no names or numbers | Placeholder 6 | Breach closed | By hand | Not built — F5, A17 | — |
| Signed A24 | The backup moderator's name and signature | Placeholder 7 | Access ends | By hand | Not built — A24 | — |
| Review account credentials | Email and password of the two review accounts | In App Store Connect only, never in the repo; deleted with the accounts when no longer needed | — | The owner | Not built — E7 | — |

Records about Resbite's own compliance hold no personal data and are kept in this folder. The Online Safety Act records (A13, A14) are kept for at least three years (DOC-4).

## 15. Legal holds

A legal hold stops evidence being destroyed while it may be needed (UGC-15). A22 sets the procedure; this section sets the rule for this schedule.

**When a hold is set.** When any of these concerns a person, a report, a chat or a resbite:
- a police or other law-enforcement request is received;
- content is reported to the NCA;
- Ofcom sends an information notice or a preservation notice;
- a legal claim is made or reasonably expected;
- the UK regulator, the Information Commission (it still uses the name ICO, ico.org.uk), opens an enquiry.

**Who sets it.** The owner, with the C6 script, which records the hold in the database **[needs C6]**. The backup moderator may set one in a child sexual abuse or intimate image case (A15, section 18). Each set and lift is logged in the law-enforcement request log, outside the repo **[needs F17]**.

**What it does.**
- Every C2 and C3 job checks the hold and skips the records it names. The rest of the job runs as normal **[needs C2, C3]**.
- An account deletion request is still accepted while a hold names the account. Access is blocked at once, and the person's data stops being visible to others. Only the erasure of the held records waits **[needs C2]**.
- A report filed by a person who deletes their account is kept anyway, with the reporter id cleared (AS-R2); a hold keeps it past its 180 days **[needs C2, C3]**.

**What it cannot pause.** Supabase logs and backups, Vercel logs and vendors' own logs roll off within 7 days or less. When a hold needs something from them, the owner copies only the named records into the access-controlled store A22 names, within the platform's period.

**How it ends.** The hold is reviewed at least every three months and whenever its matter changes, and lifted as soon as it is no longer needed (A15, section 18; A22). While a hold covers a closed report, nobody runs `supabase/ops/purge-closed-reports.sql` by hand, because that script does not check holds. Once lifted, the normal period resumes. If that period has already passed, the records are deleted at the next run.

**Telling the person.** The person is told their erasure is delayed, unless telling them would harm an investigation or the law forbids it. A22 decides.

## 16. What account deletion removes and keeps

Based on `request_account_deletion` (`supabase/migrations/20261116120000_open_beta.sql:208-273`), the clean-up worker, and the changes C2 makes.

| At the request (at once) | By the clean-up (within 30 days, aiming for minutes) | Kept, and for how long |
|---|---|---|
| Access blocked; every session ended | The Auth user and its identities | Reports others made about the person, with the frozen words: until 180 days after closing. Reports the person filed, with their id cleared: the same (AS-R2) **[needs C2; today they are deleted]** |
| Profile blanked to "Deleted member"; photo detached | Profile photos in Storage | The suspension record, with the user id cleared and the reason and dates kept: 12 months after the deletion (AS-R1, D-19, section 7) **[needs C2; today it cascades away]** |
| Future resbites the person hosts cancelled, with a push to guests; on all their resbites the place cleared and the title, description, cover, note to guests, meeting details and area blanked (redaction trigger) | The profile row (cascade) | The deletion receipt: 30 days after clean-up |
| Guest rows, push endpoints, the person's notices | | Blanked messages (no text, no author) and cancelled resbites: until their own periods end |
| Connections and refusals, both ways | | Backups: up to 7 days, with deletions replayed after any restore |
| Blocks both ways; the reporter id on reports the person filed (AS-R2); chat rules records; moderator row | | Anything under a legal hold: until the hold is lifted |
| Messages and announcements: text and author blanked; read positions and mutes removed | | |
| Removal records about the person; "brought by" links cleared | | |
| Sign in with Apple tokens revoked **[needs B3, C2]** | | |

## 17. What must be built

| Item | What it adds to this schedule | Today |
|---|---|---|
| C1 | Test codes emptied; test-mode tables dropped after the log review; SMS log settings | Test mode on |
| C2 | Deletion for every account type; receipt purge; reservation purge; the legal hold in deletion; the restore replay; the suspension record kept after deletion with the id cleared (AS-R1); reports kept after their reporter's deletion with the id cleared (AS-R2) | Local only, gated off, entry point unwired (DEL-1) |
| C3 | Every "Not built — C3" row: numbers, removals, chat, plans, covers, outbox, refusals, requests, link opens, closed reports, suspensions, the suppression list, web-only accounts and unconfirmed code requests (AS-R4), leftovers; all checking the hold | Only the manual closed-report script exists |
| C6 | Suspend by id; record a lift after appeal; removal scripts; set and lift holds; the owner-run deletion script for banned, web-only and under-18 accounts, with the app's lifecycle (AS-R3) | Not built |
| C8, C9 | The versioned Terms record; the optional details erased | Not built |
| D1, F1, F3, F4, F5, F17 | The inboxes, the contact form and the logs outside the repo | Not built |
| F7 | Vendors' own log periods confirmed | Not done |
| F11 | A rehearsed restore with deletion replay | Never rehearsed |

## 18. Review log

Roles only. No names.

| Date | Version | By | Change |
|---|---|---|---|
| 17 November 2026 | 1.0 draft | The owner | First schedule, from the D-8 defaults, for solicitor review |
| 17 November 2026 | 1.0 draft | The owner | The rulings applied: suspension records outlive deletion with the id cleared (AS-R1); reports outlive their reporter (AS-R2); web-only accounts and unconfirmed code requests (AS-R4); Twilio's message records (AS-D5, placeholder 2) |

## Sources

- The gap analysis, section 5 (D-8 table, D-4, D-15, D-19, D-20, D-23) and rows PRV-3, PRV-7, PRV-19, PRV-21, OPS-8, UGC-15: `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`
- `research_notes/App Store readiness/audit-data-inventory.md` (§2–§13); `qa/b0-retention-proposal.md`
- Code checked on 17 November 2026: every file cited in the tables; the table list from `grep -i "create table" supabase/migrations/*.sql`
- Vercel, runtime logs (periods by plan; read 17 November 2026): https://vercel.com/docs/logs/runtime
- Expo, privacy explained (push content "never stored"; read 17 November 2026): https://expo.dev/privacy-explained
- Supabase pricing and logs (7-day logs and backups on Pro), as cited in DI §9: https://supabase.com/pricing
- Cloudflare, Turnstile privacy addendum (read 17 November 2026): https://www.cloudflare.com/turnstile-privacy-policy/
