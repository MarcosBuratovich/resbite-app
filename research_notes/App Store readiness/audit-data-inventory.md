# Personal data inventory (audit)

Prepared 17 November 2026, from `main` at `db8a221`. Read-only audit: no hosted project, Vercel, EAS or App Store Connect was touched. The hosted state is taken from the repo's records.

This file lists every personal data item the system collects, derives or stores, who sees it, where it lives, how long it stays and what deletes it. It ends with a draft mapping onto Apple's App Privacy categories. A privacy policy, a records-of-processing table (UK GDPR Article 30) and the App Privacy label can be written from it.

## 0. How to read this

**Live or local.** A migration is **LIVE** only when it is listed in `supabase/tests/hosted-baseline/migrations.txt`. Eight local files are **not** listed there, so they are **LOCAL-ONLY**:

| Local-only migration | What it holds | Evidence |
|---|---|---|
| `20260918001316_account_deletion_lifecycle.sql` | Account deletion jobs and the deletion request | `supabase/tests/hosted-baseline/migrations.txt:3-27` (absent); file header `supabase/migrations/20260918001316_account_deletion_lifecycle.sql:1` "Prepared locally" |
| `20260923152816_orphan_profile_photo_cleanup.sql` | Clean-up of replaced profile photos | `supabase/migrations/20260923152816_orphan_profile_photo_cleanup.sql:1` "Prepared only" |
| `20260923152943_deletion_receipt_retention.sql` | Purge of deletion receipts after 30 days | `supabase/functions/purge-deletion-receipts/README.md:3` "not deployed or enabled" |
| `20260929125858_deletion_intent_reservations.sql` | Deletion ledger reservations | `supabase/functions/delete-account/README.md:63` "not deployed" |
| `20261022120001_gi2_local_delivery_and_deletion.sql` | Deletion-aware eligibility | `docs/implementation-status.md:582` "LOCAL-ONLY" |
| `20260918001308_notification_delivery_preparation.sql`, `20261014130000_ux2_notification_wording.sql`, `20261015130000_ux3_note_delivery.sql` | Push pieces; their content went live through `20261030120000_push_delivery.sql` | `supabase/migrations/20261030120000_push_delivery.sql:3-10` |

**Edge functions.** `deliver-notifications` is live and sending (`supabase/functions/deliver-notifications/index.ts:9`, `supabase/functions/deliver-notifications/README.md:3`). `fold-phone-account` is live (`supabase/functions/fold-phone-account/README.md:1`, `supabase/functions/_shared/fold-release.ts:4`). `delete-account`, `cleanup-account`, `cleanup-profile-photos` and `purge-deletion-receipts` are source-gated off (`supabase/functions/_shared/deletion-release.ts:4,8`, `supabase/functions/cleanup-profile-photos/index.ts:9`).

**Owner-run scripts, not schedules.** Report closing, report purging, suspension and moderator lists run only when the owner pastes them (`supabase/ops/purge-closed-reports.sql:4`, `supabase/ops/close-report.sql:3`, `supabase/ops/suspend-account.sql:4`, `supabase/ops/moderators.sql:4`). The two scheduled jobs are the push sender every minute and the repeating-resbite roll every five minutes (`supabase/ops/schedule-deliver-notifications.sql:33-47`, `supabase/ops/schedule-roll-repeating-plans.sql:27-31`). Neither deletes personal data.

**Hosting.** Supabase project in London, `eu-west-2`, on the Pro plan (`docs/implementation-status.md:30`, `knowledge-base/08-decisions.md:97`, `qa/b0-retention-proposal.md:22`). Database, Auth, Storage and Realtime sit in that project.

**"Kept forever"** below means: no code, schedule or script deletes it, and no account deletion is live to remove it.

## 1. Headline points

1. **No live way to delete an account or its data.** The deletion lifecycle is local-only, and its release gate is `false` (`supabase/functions/_shared/deletion-release.ts:4`). The app says deletion "is not enabled in this development build" (`mobile/app/delete-account.tsx:159-168`). Even when released, it needs a confirmed email: phone-only accounts can never delete (`mobile/app/delete-account.tsx:67-68`; `supabase/migrations/20261116120000_open_beta.sql:224`). Apple requires in-app deletion ([Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app/)).
2. **Almost nothing has a retention period.** Plans, guest lists, chat messages, join requests, connections, the notification outbox, push delivery rows, test-mode phone codes and logs have no time-based deletion. Only closed reports have one (180 days), and that runs by hand.
3. **Phone numbers of people who are not users are stored on the server in plain digits**, with no expiry (`supabase/migrations/20261028120000_contact_invitations.sql:12-25`; `supabase/migrations/20261111130000_circles_of_trust.sql:45-51`). The in-app Privacy page says "selected contact details ... stay on this device" (`mobile/app/data-privacy.tsx:57-59`).
4. **Phone codes are in test mode**: 000000 works for any number (`supabase/migrations/20261027120000_phone_accounts.sql:77-96`; `knowledge-base/08-decisions.md:391`). So a "verified" number is not verified, and every number that asked for a code stays in `private.test_codes` with its code.
5. **Optional sign-up details have no current purpose**: date of birth, a second unverified phone number, city and interests ("Recommendations based on interests are not active yet", `mobile/src/design/RegistrationDetails.tsx:37`). They live in Auth user metadata, which Supabase copies into every access token.
6. **Chat text leaves the UK.** Push notices carry the sender's first name and up to 120 graphemes of the message (`supabase/functions/_shared/notification-copy.ts:6-8`). The Expo push service is hosted in the United States ([Expo](https://docs.expo.dev/push-notifications/sending-notifications/)).
7. **No analytics, crash reporting, advertising or tracking SDK** is in the app or the web site (searched `mobile/package.json:14-54`, `mobile/src`, `mobile/app`, `links/`). No tracking in Apple's sense.
8. **No `ios.privacyManifests` in `mobile/app.json`.** Bundled manifests exist in six dependencies. Expo says Apple does not always read manifests from static CocoaPods ([Expo](https://docs.expo.dev/guides/apple-privacy/)).

## 2. Account and sign-in data (Supabase Auth, London)

| Data item | Collected where | Purpose | Who can see it | Stored | Kept for / deleted by | Evidence |
|---|---|---|---|---|---|---|
| Account id (UUID) | Every sign-up | Key for all records | The person; anyone who shares a resbite sees it inside API replies (profile ids) | `auth.users.id`, `public.profiles.id` | Kept forever; no live deletion | `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:12-18` |
| Verified phone number (E.164 digits) | Phone sign-up `/auth/phone`; Add phone; the web answer page | Sign-in; matching invitations by number; "On Resbite" lookup | The person. Not shown to others. A person who has the number can learn the account is on Resbite (lookup) | `auth.users.phone`, `phone_confirmed_at` | Kept forever | `mobile/src/services/phoneCode.ts:42,69`; `links/assets/personal.js:426,450`; lookup `supabase/migrations/20261028120000_contact_invitations.sql:67-81` |
| Email address | Email/password sign-up; Sign in with Apple (may be a private relay address); Google | Sign-in, confirmation and reset emails; deletion proof (when released) | The person; owner via SQL | `auth.users.email` | Kept forever | `mobile/src/state/useAuthFlow.ts:155-158`; `mobile/src/services/appleSignIn.ts:68-71`; `mobile/src/state/useAuthFlow.ts:241-252` |
| Password (hashed by Supabase) | Email/password sign-up | Sign-in | Nobody | `auth.users` (Supabase-managed hash) | Kept forever | `mobile/src/state/useAuthFlow.ts:155-158,164` |
| Apple identity (Apple user id, email, first-time name) | Sign in with Apple, scopes FULL_NAME and EMAIL | Sign-in; name suggestion | The person | `auth.identities` (Supabase-managed); name copied to `user_metadata.display_name` | Kept forever. No Apple token revocation anywhere in the repo | `mobile/src/services/appleSignIn.ts:66-72`; `mobile/src/state/useAuthFlow.ts:273-278`; searched `supabase/functions`, `mobile/src` for `appleid.apple.com` / revoke: none |
| Google identity (Google id, email, name, picture URL) | "Continue with Google" (system browser, PKCE) | Sign-in; name suggestion | The person | `auth.identities` and `user_metadata` (Supabase-managed). Picture URL received but unused (UNVERIFIED field list) | Kept forever. Hosted provider state UNVERIFIED: last record says "Disabled" | `mobile/src/state/useAuthFlow.ts:234-258`; `mobile/app/auth/index.tsx:226`; `qa/auth-readiness.md:13` |
| Display name in metadata | Sign-up, Apple, Google, About you | Profile name fallback | The person (in their token) | `auth.users.raw_user_meta_data.display_name` | Kept forever | `mobile/src/domain/registration.ts:74-78`; `mobile/app/about-you.tsx:66` |
| Date of birth (optional) | Email sign-up step 0; Account details | **None active.** Not used as an age gate | The person; copied into the access token (JWT `user_metadata`) | `raw_user_meta_data.registration_details.birth_date` | Until the person clears it; else forever | `supabase/migrations/20260923150902_atomic_registration_details.sql:35-51,82-84`; `mobile/src/domain/registration.ts:80-87`; JWT claim ([Supabase](https://supabase.com/docs/guides/auth/jwt-fields)) |
| Second phone number (optional, **unverified**) | Email sign-up step 1; Account details | **None active.** Separate from the verified phone | As above | `registration_details.phone` | As above | `supabase/migrations/20260923150902_atomic_registration_details.sql:52-55`; `mobile/app/data-privacy.tsx:85-88` |
| City (optional) | Email sign-up step 1; Account details | **None active** | As above | `registration_details.city` | As above | `supabase/migrations/20260923150902_atomic_registration_details.sql:56-60` |
| Interests (up to 6 of a fixed list) | Email sign-up step 1; Account details | **None active** ("not active yet") | As above | `registration_details.interests` | As above | `supabase/migrations/20260923150902_atomic_registration_details.sql:61-69`; `mobile/src/design/RegistrationDetails.tsx:37` |
| Sessions: refresh tokens, IP address, user agent, times | Every sign-in | Keep people signed in; security | Owner via dashboard/SQL | `auth.sessions` (has an `ip` column), `auth.refresh_tokens` (Supabase-managed) | Until sign-out or token expiry; the rows' retention is Supabase's | [Supabase Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs) (points to `auth.sessions.ip`); sign-out `mobile/src/services/sessionLifecycle.ts:1-12` |
| Auth audit events (user id, action, IP for some events, user agent) | Auth actions | Security | Owner (dashboard) | Supabase log store. Database copy is **off** on this project | 7 days on Pro | `qa/b0-retention-proposal.md:25`; [Supabase pricing](https://supabase.com/pricing) "Auth Audit Logs 7 days"; [audit logs](https://supabase.com/docs/guides/auth/audit-logs) |
| Last sign-in time, confirmation times, ban state | Auth | Access checks | Owner | `auth.users` | Kept forever | `supabase/migrations/20261116120000_open_beta.sql:40-48` |

## 3. Profile, access and age records

| Data item | Collected where | Purpose | Who can see it | Stored | Kept for / deleted by | Evidence |
|---|---|---|---|---|---|---|
| Display name (1-80 chars) | About you; sign-up; web answer page "Your name" | Shown to hosts and guests | The person; people on a shared resbite where guests are visible; the public web page shows the **host's** name to anyone with the link | `public.profiles.display_name` | Kept forever (deletion would blank it to "Deleted member", local-only) | `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:12-18`; visibility `supabase/migrations/20261014120000_ux2_rules.sql:117-121`; public `supabase/migrations/20261031120000_creating_a_resbite.sql:255-262`; web `links/assets/personal-flow.mjs:45-46` |
| Profile photo (optional) | Profile; resized to 1024 px, re-encoded JPEG, EXIF stripped | Shown to people on shared resbites | Same as name; signed links last 300 s | Supabase Storage bucket `profile-photos` (private, 2 MB, London) | **Kept forever.** Removing or replacing clears the reference only; the file stays (clean-up local-only) | `mobile/src/services/photo.ts:51-90`; `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:264-290`; `mobile/src/services/profile.ts:98-103`; `mobile/app/data-privacy.tsx:97-101` |
| Avatar revision counter | Photo change | Avoid lost updates | Readers of the profile | `profiles.avatar_revision` | Forever | `supabase/migrations/20260924150135_avatar_revision_compare_and_swap.sql:2` |
| Deletion flag | Deletion request (local-only) | Block access while deleting | Database | `profiles.deletion_requested_at` | Never set on hosted today | `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:16`; `supabase/migrations/20261116120000_open_beta.sql:202-206` |
| 18+ and Terms tick (time, terms version "2026-10", method "tick") | Phone sign-up; web answer page; app invitation flow | Record of age confirmation and terms agreement | Owner via SQL | `private.age_attestations` | Forever; written once, never overwritten. **Not written for email, Apple or Google accounts** (no tick on those routes or on Add phone) | `supabase/migrations/20261022120000_gi2_guest_accounts.sql:24-29`; `supabase/migrations/20261027120000_phone_accounts.sql:324-335`; `mobile/app/auth/phone.tsx:99-110`; `mobile/app/invite.tsx:242-254`; `mobile/src/domain/guestAccount.ts:4`; no tick in `mobile/app/auth/index.tsx`, `mobile/app/add-phone.tsx` |
| Access grant / ban (source, link, granted, revoked) | Joining, approval, invitation, owner SQL | Now mainly the owner's ban (revoked grant) | Owner | `private.beta_access` | Forever (cascade with the Auth user) | `supabase/migrations/20261022120000_gi2_guest_accounts.sql:12-18`; `supabase/migrations/20261116120000_open_beta.sql:25-31` |
| Tester roster emails | Owner SQL | Old beta gate; now only suspension and three legacy flows | Owner | `private.tester_roster` | Until removed by hand | `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:7-11`; `supabase/migrations/20261116120000_open_beta.sql:15-22` |
| "Has used the app": first and last session time | App calls `note_app_session` on sign-in and refresh | Show "On Resbite" only for real app users | Database only | `private.app_sessions` | Forever | `supabase/migrations/20261027120000_phone_accounts.sql:290-315`; `mobile/src/state/AccountState.tsx:110` |
| Suspension record (user, report, what changed, time) | Owner runs `suspend-account.sql` | Undo a suspension exactly | Owner | `private.suspensions` | Until the undo; else forever (outlives the report) | `supabase/migrations/20261111160000_chat_safety.sql:788-800`; `supabase/migrations/20261116120000_open_beta.sql:37`; `supabase/ops/suspend-account.sql:1-31` |
| Moderator list (user ids) | Owner runs `moderators.sql` with emails | Who gets "A new report is waiting" pushes | Owner | `private.moderators` | Until changed. Backup moderator not named | `supabase/migrations/20261111160000_chat_safety.sql:805-809`; `supabase/ops/moderators.sql:1-17`; `knowledge-base/08-decisions.md:749` |
| Chat rules acceptance (version, time) | First message | Proof the person agreed to the chat rules | Owner | `private.chat_rules_acceptances` | Forever | `supabase/migrations/20261111160000_chat_safety.sql:811-818,847-857` |
| Phone number rewrite record (old and new number) | Owner script for older Argentine numbers | Rollback of that script | Owner | `private.phone_rewrites` | "Temporary" but no drop is written yet: forever | `supabase/migrations/20261030130000_phone_key.sql:264-277` |

## 4. Resbites (plans) and taking part

| Data item | Collected where | Purpose | Who can see it | Stored | Kept for / deleted by | Evidence |
|---|---|---|---|---|---|---|
| Title, description (up to 1,000), categories, source idea | Create | Describe the resbite | Host and everyone on it; **title and host name are public** to anyone with the event link | `public.plans` | Forever. No code deletes a plan; cancelled ones stay | `supabase/migrations/20261007150000_custom_events.sql:45-47`; public read `supabase/migrations/20261031120000_creating_a_resbite.sql:247-264` |
| Start, end, time zone, repeat rule | Create | Schedule | As above; time public on the link page | `plans.starts_at`, `ends_at`, `time_zone`, `repeat_weeks`, `series_id` | Forever | `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:32-33`; `supabase/migrations/20261015120000_ux3_event_details.sql:8`; `supabase/migrations/20261031120000_creating_a_resbite.sql:799-813` |
| Exact meeting place (free text, may be a home address) | Where sheet | Where to meet | Host and everyone invited (pending included) | `plans.place_label` | Forever | `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:34`; `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:99-102` |
| Area shown before replying (up to 80) | Where sheet | Rough location before people answer | **Public** to anyone with the event link | `plans.area` | Forever | `supabase/migrations/20261021120000_gi1_event_links.sql:85-86` |
| Latitude/longitude | Columns exist; **the app never sends them** | None in use | — | `plans.latitude`, `longitude` (null) | — | `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:35-36`; `mobile/src/services/plans.ts:43-60` (no `p_lat`/`p_lon`) |
| Meeting details (private note, up to 2,000) | Create/edit | Door codes, directions | Host and guests who answered Going or Maybe | `public.plan_meeting_details` | Forever | `supabase/migrations/20261015120000_ux3_event_details.sql:11-33` |
| Note to guests (up to 280) and time | Event page | Pinned announcement | Everyone on it | `plans.guest_note`, `guest_note_at` | Forever | `supabase/migrations/20261015120000_ux3_event_details.sql:189-192` |
| Cover photo and its description | Cover picker | Event picture | Everyone on it; **anyone with the event or personal link** (the web image route signs and proxies it) | Bucket `plan-covers` (private, 2 MB, JPEG, London); `plans.cover_path`, `cover_description` | **Kept forever.** No delete policy and no clean-up job, not even local | `supabase/migrations/20261007200000_plan_covers.sql:41-70`; `supabase/migrations/20261014120000_ux2_rules.sql:125-128`; `links/server/api/image.mjs:55-68`; `links/server/lib/supabase.mjs:41-54` |
| Guest list: who, answer (pending/Going/Maybe/Can't go/withdrawn), when | Inviting, answering | Run the resbite | Host; guests where the host shows guests | `public.attendees` | Forever | `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:45-52`; `supabase/migrations/20261014120000_ux2_rules.sql:117-121` |
| Who brought whom, level | Circles of trust | Limit bringing | Host; people list | `attendees.brought_by`, `level` | Forever (set null if the bringer's Auth user goes) | `supabase/migrations/20261111130000_circles_of_trust.sql:23-31` |
| Co-hosts (who appointed whom) | Host appoints | Admin rights | People on the resbite who may see guests | `public.plan_admins` | Forever | `supabase/migrations/20261031120000_creating_a_resbite.sql:8-19` |
| Join requests by link (answer, status, times) | Event link in app or web | Host approves people from the open link | Host | `private.join_requests` | Forever after decision | `supabase/migrations/20261029120000_open_link_approval.sql:10-26` |
| Removed people per series (user id **or phone number**) | Host removes, declines or revokes | Stop a guest bringing them straight back | Database only | `private.plan_removals` | Forever (no foreign key to the series) | `supabase/migrations/20261111130000_circles_of_trust.sql:38-51` |
| Mutes (resbite, chat) | Mute switch | Stop pushes | The person | `public.plan_mutes`, `public.chat_mutes` | Forever | `supabase/migrations/20261031120000_creating_a_resbite.sql:926-938`; `supabase/migrations/20261111140000_chat_core.sql:108-115` |
| Left a group | Leave group | Skip from future occurrences | Database only | `private.series_leaves` | Forever | `supabase/migrations/20261111150000_chat_groups.sql:29-38` |

## 5. Invitations, links and other people's phone numbers

| Data item | Collected where | Purpose | Who can see it | Stored | Kept for / deleted by | Evidence |
|---|---|---|---|---|---|---|
| Invited contact's phone digits and calling code (often a **non-user**) | Invite people → phone contacts or typed number | Personal invitation by number | The host who invited (full number); other hosts see only the last two digits of guests' links; the web page shows the last two digits | `private.phone_invitations.phone`, `country` (plain digits) | **Forever.** Revoking keeps the number; only plan deletion cascades, and plans are never deleted | `supabase/migrations/20261028120000_contact_invitations.sql:9-25,88-133,135-144`; `supabase/migrations/20261111130000_circles_of_trust.sql:151-170` |
| Personal invitation code | Made on the host's phone | Link `/i/<code>` | Holder of the link | Server keeps only a SHA-256 hash; the host's phone keeps the code and the contact's name | Hash forever (nulled on revoke) | `supabase/migrations/20261028120000_contact_invitations.sql:9-11,124-125`; `mobile/src/services/inviteCodeStore.ts:3-21` |
| Wrong-number check counter | Web answer page | 10 tries per invitation per hour | Database | `phone_invitations.check_count`, `check_window` | Forever | `supabase/migrations/20261028120000_contact_invitations.sql:220-237` |
| Who invited, who answered, when | Invite and answer | Show the host who replied | Host | `phone_invitations.invited_by`, `user_id`, `answered_at`, `brought_by` | Forever | `supabase/migrations/20261028120000_contact_invitations.sql:18-21` |
| Daily lookup count | Each "who is on Resbite" check and each invite | Limit to 500 numbers a day | Database | `private.lookup_usage` (one row per user, overwritten daily) | While the account exists | `supabase/migrations/20261028120000_contact_invitations.sql:30-61` |
| Event link code | Host shares link | Open link `/r/<code>` | Anyone with it | `private.plan_links` | Forever | `supabase/migrations/20261021120000_gi1_event_links.sql:7-18` |
| Link opens (link id and time only) | App opening a link | Count opens for the host | Nobody but the database | `private.link_opens` | Forever. Not linked to a person | `supabase/migrations/20261022120000_gi2_guest_accounts.sql:136-162`; `mobile/src/services/guestJoin.ts:59-66` |
| Legacy per-person invitation (token hash, intended email) | Before GI1; app no longer creates them | Old links | Database | `private.invitations` | Forever | `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:54-62,152-168`; RPC list in `mobile/src` has `claim_invite` only |
| Invitation text sent by WhatsApp or Messages | The host taps send | Deliver the personal link | The recipient; WhatsApp (Meta) or Apple Messages carry it | Not stored by Resbite; the phone opens the other app with number and text | — | `mobile/src/services/inviteSend.ts:26-49`; `mobile/app.json:17` |

## 6. Chat

| Data item | Collected where | Purpose | Who can see it | Stored | Kept for / deleted by | Evidence |
|---|---|---|---|---|---|---|
| Messages and announcements (up to 1,000 chars), author, time, client id | Chat | Group conversation | Everyone in the resbite's chat, including people who join later. Not end-to-end encrypted | `public.messages` | **Forever.** Delete or host remove blanks the text; the row stays. Account deletion would blank text (local-only) | `supabase/migrations/20261111140000_chat_core.sql:24-45,573-607`; `mobile/app/data-privacy.tsx:117-123` |
| System lines (who did what, as user ids) | Server | Feed events | Chat members | `messages.payload` | Forever | `supabase/migrations/20261111140000_chat_core.sql:24-27` |
| Read position | Opening a chat | Unread counts | Database | `public.chat_reads` | Forever | `supabase/migrations/20261111140000_chat_core.sql:99-107` |
| Live signal | Each new or changed message | Refresh open chats | Members on a private Realtime channel. Carries only id, kind and state | Supabase Realtime (London) | Transient | `supabase/migrations/20261111140000_chat_core.sql:1100-1106,1130-1132`; `mobile/src/state/chatSession.ts:1082` |

## 7. Safety: blocks and reports

| Data item | Collected where | Purpose | Who can see it | Stored | Kept for / deleted by | Evidence |
|---|---|---|---|---|---|---|
| Block (blocker, blocked, time) | Block from a person or message | Hide and silence someone | The blocker (Blocked people list); owner. Never told to the blocked person | `private.blocks` | Until unblocked or a profile goes | `supabase/migrations/20261111160000_chat_safety.sql:22-35`; `mobile/src/domain/safetyCopy.ts:91` |
| Report (reporter, person, message, reason, details up to 500, frozen copy of the words and author, review note, action) | Report sheet | Moderation (Guideline 1.2) | Owner/moderators via SQL scripts | `private.reports` | Closed: 180 days then deleted **by an owner-run script**, not a schedule. Open: no limit. Reporter's reports go with the reporter's profile | `supabase/migrations/20261111160000_chat_safety.sql:753-787,840-843,1112-1150`; `supabase/ops/purge-closed-reports.sql:1-19`; `mobile/src/domain/safetyCopy.ts:85-86` |
| Blocked terms (word list) | Owner script | Refuse messages with listed words | Owner | `private.blocked_terms` | Until changed. Not personal data | `supabase/migrations/20261111160000_chat_safety.sql:822-832` |

## 8. Notifications

| Data item | Collected where | Purpose | Who can see it | Stored | Kept for / deleted by | Evidence |
|---|---|---|---|---|---|---|
| Expo push token, platform, time | Notification permission granted; build with `EXPO_PUBLIC_PUSH_ENABLED=true` | Send pushes | Database; sender | `private.device_endpoints` | Until sign-out removes it or Expo reports it invalid | `supabase/migrations/20261030120000_push_delivery.sql:68-97,182-192`; `mobile/src/services/pushDevice.ts:313-330` |
| Notice queue (recipient, kind, resbite, actor, detail such as an RSVP answer, message id, times) | Server events | Push wording and history | Database. Old `invited` notices also name who invited a person | `private.notification_outbox` | **Forever.** Nothing purges it; a later feature reads old rows | `supabase/migrations/20260917190517_resbite_private_tester_foundation.sql:72-84`; `supabase/migrations/20261014120000_ux2_rules.sql:10-14`; `supabase/migrations/20261111140000_chat_core.sql:378`; `supabase/migrations/20261111160000_chat_safety.sql:37-58` |
| Delivery ledger (token copy, state, Expo ticket id) | Sender | Retries and receipts | Database | `private.notification_deliveries` | **Forever**, including the token copy after the device is removed | `supabase/migrations/20261030120000_push_delivery.sql:18-37` |
| Push content: event title, actor's first name, time; **chat sender's first name and up to 120 graphemes of the message** | Sender builds it | Tell people what happened | Expo push service (US), Apple Push Notification service, the lock screen | Expo keeps receipts 24 hours | `supabase/functions/_shared/notification-copy.ts:1-8,100-176`; `supabase/migrations/20261111160000_chat_safety.sql:419`; `supabase/functions/_shared/notification-adapters.ts:16`; [Expo](https://docs.expo.dev/push-notifications/sending-notifications/) |
| Push data (type, resbite id, series id, notice id) | Sender | Open the right screen | Device | Device notification centre | `supabase/functions/_shared/notification-engine.ts:68-80` |
| Moderator push "A new report is waiting." | New report | Moderation | Moderators | No report content in the push | `supabase/functions/_shared/notification-copy.ts:167` |

## 9. Logs, backups and operational records

| Data item | Collected where | Purpose | Who can see it | Stored | Kept for / deleted by | Evidence |
|---|---|---|---|---|---|---|
| Test-mode phone codes: **full phone digits and the 6-digit code** | Every code request (app and web) while test mode is on | Stand-in for an SMS provider | Owner via SQL | `private.test_codes` (one row per number) | **Forever.** Only overwritten per number; cleared once by a migration in October | `supabase/migrations/20261027120000_phone_accounts.sql:22-29,49-70`; `supabase/migrations/20261030130000_phone_key.sql:26-50,261-262` |
| Test-mode log (last two digits, account id, sent/exchanged, time) | Each code send and use | Audit of test mode | Owner | `private.test_mode_log` | **Forever** | `supabase/migrations/20261027120000_phone_accounts.sql:31-41,68,94` |
| Test mode switch | Owner | On/off | Owner | `private.phone_mode` | — | `supabase/migrations/20261027120000_phone_accounts.sql:11-20` |
| Supabase API, Postgres, Auth, Storage, Realtime and Edge Function logs (path, user id in JWT subject, raw JSON) | Every request | Operation, debugging, security | Owner (dashboard) | Supabase log store | 7 days on Pro. IP and user-agent fields in API logs: UNVERIFIED from docs | [Supabase logs](https://supabase.com/docs/guides/telemetry/logs); [pricing](https://supabase.com/pricing); `qa/b0-retention-proposal.md:24` |
| Database backups (everything above) | Daily | Disaster recovery | Owner | Supabase backups; include Storage metadata, not image files | 7 days; no point-in-time recovery | `qa/b0-retention-proposal.md:22-23` |
| Vercel runtime logs for link.resbite.com (path with the link code, search params, user agent, region; IP used for matching) | Each page and image request | Hosting | Owner (Vercel dashboard) | Vercel | 1 hour (Hobby) or 1 day (Pro). Project plan UNVERIFIED | `docs/implementation-status.md:538`; [Vercel runtime logs](https://vercel.com/docs/logs/runtime) |
| Auth emails (address, code or link) | Confirm, reset, email code | Sign-up and recovery | Resend (SMTP) | Resend stores data in the US | Resend's retention: UNVERIFIED | `qa/auth-readiness.md:74-80`; [Resend GDPR](https://resend.com/security/gdpr); [Resend regions](https://resend.com/docs/dashboard/domains/regions) |

## 10. Deletion and retention mechanisms

| Mechanism | What it would remove | State | Evidence |
|---|---|---|---|
| Account deletion request (`request_account_deletion`) | Blanks profile, cancels owned future plans, removes guest rows, endpoints, outbox, connections, refusals, blocks, filed reports, chat rules rows, moderator row, chat text | **LOCAL-ONLY.** Not on hosted; later migrations redefine it only "where it exists" | `supabase/migrations/20260918001316_account_deletion_lifecycle.sql:44-81`; `supabase/migrations/20261116120000_open_beta.sql:202-276`; `supabase/migrations/20261111160000_chat_safety.sql:1246-1311` |
| `delete-account` and `cleanup-account` Edge functions | Request, then Storage photos and the Auth user | Source gate `false`; app flag off | `supabase/functions/_shared/deletion-release.ts:4`; `supabase/functions/delete-account/README.md:1-3`; `mobile/app/delete-account.tsx:67-68,159-168` |
| Deletion needs a confirmed email | — | Phone-only accounts are refused (app and SQL) | `mobile/app/delete-account.tsx:67-68`; `supabase/migrations/20261116120000_open_beta.sql:224`; `knowledge-base/08-decisions.md:776` |
| Orphan profile photo clean-up (7 days unattached) | Replaced or removed avatars | LOCAL-ONLY, gate `false` | `supabase/migrations/20260923152816_orphan_profile_photo_cleanup.sql:1`; `supabase/functions/cleanup-profile-photos/index.ts:9`; `qa/b0-retention-proposal.md:12` |
| Cover photo clean-up | Old covers | **Does not exist** | `supabase/migrations/20261007200000_plan_covers.sql:63-64` "No delete policy: clients only detach" |
| Deletion receipt purge (30 days) | Deletion job rows | LOCAL-ONLY, gate `false` | `supabase/functions/purge-deletion-receipts/README.md:3-5` |
| Closed report purge (180 days) | Closed reports | Owner-run script, by hand | `supabase/ops/purge-closed-reports.sql:1-19` |
| Web-only account fold | Deletes a web-only Auth user after moving its answers into the app account | **LIVE** | `supabase/functions/fold-phone-account/README.md:1-9`; `supabase/functions/_shared/phone-fold.ts:79` |
| Message delete / host remove | Message text | LIVE (row stays) | `supabase/migrations/20261111140000_chat_core.sql:573-607` |
| Sign Apple tokens out on deletion (Apple REST API) | Apple authorisation | **Not implemented** | Repo search: no `appleid.apple.com` or revoke call; [Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app/) |

## 11. On the iPhone

All app stores below use the iOS Keychain through `expo-secure-store`, split into 400-character chunks (`mobile/src/services/secureChunks.ts:6-60`). Keychain items may survive deleting the app ([Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)). Sign-out clears most per-account stores (`mobile/src/services/sessionLifecycle.ts:22-40`).

| Item | What it holds | Cleared by | Evidence |
|---|---|---|---|
| Supabase session | Access token (JWT with email, phone, `user_metadata` incl. optional DOB, city, interests) and refresh token | Sign-out | `mobile/src/services/supabase.ts:6-35`; [Supabase JWT fields](https://supabase.com/docs/guides/auth/jwt-fields) |
| `resbite.people.v1.<account>` | Local groups and per-plan people: contact names, phone numbers, emails | Sign-out | `mobile/src/services/peopleStore.ts:1-40`; `mobile/src/domain/people.ts:1-30` |
| `resbite.invite-codes.v1.<account>` | Personal codes, contact name, number, WhatsApp or Messages | Sign-out | `mobile/src/services/inviteCodeStore.ts:3-21` |
| `resbite.recent-places.v1.<account>` | Recently used meeting places | Sign-out | `mobile/src/services/recentPlacesStore.ts:14` |
| `resbite.create-journal.v1.<account>` | Unfinished plan drafts (title, description, place, notes) | **Kept after sign-out** by design; Discard removes | `mobile/src/services/createJournal.ts:17`; `mobile/app/data-privacy.tsx:71-74` |
| `resbite.chat-queue.v1.<account>` | Messages written but not yet sent | Sign-out | `mobile/src/services/chatQueue.ts:51` |
| `resbite.reminder-prefs.v1`, `resbite.calendar-records.v1` | Reminder switches; which resbites were added to the calendar | Sign-out | `mobile/src/services/reminderPrefsStore.ts:25`; `mobile/src/services/calendarRecordStore.ts:30` |
| `resbite.photo.v1`, `resbite.cover.v1.index` and JPEG files in the app's Documents folder | A profile or cover photo waiting to upload | Sign-out | `mobile/src/services/profile.ts:9-40`; `mobile/src/services/planCovers.ts:14-45`; `mobile/src/services/coverJournalIndex.ts:8` |
| `resbite.pending-auth-email.v1` | Email address of a pending confirmation or reset | Confirming, or "forget" | `mobile/src/services/confirmationFlow.ts:12`; `mobile/src/state/useAuthFlow.ts:224-232` |
| `resbite.pending-invite`, `resbite.pending-terms` | Invite link waiting for sign-in; the tick | After use | `mobile/src/services/pendingInviteStore.ts:3-5` |
| `resbite.push-endpoint` | The Expo push token bound to this account | Sign-out | `mobile/src/services/pushDevice.ts:23` |
| `resbite.deletion.<account>`, `resbite.deletion-recovery` | Deletion receipt (request id, recovery secret) | Feature off today | `mobile/src/services/accountDeletion.ts:16-21` |
| Local reminders | Event title and time, scheduled by iOS | Sign-out; event changes | `mobile/src/services/reminders.ts:83-98` |
| Calendar entry | Added through iPhone's own form; the app does not read the calendar | The person, in Calendar | `mobile/src/services/calendar.ts:46-47`; `mobile/app.json:75-76` |
| Address book | Read only on the explicit "phone contacts" action: name, phones, emails, 50 per page. Never stored as a whole | — | `mobile/src/services/contacts.ts:24-27,107-131` |
| Photos | Picked through the system picker; EXIF off | — | `mobile/src/services/photo.ts:55-62` |
| Location | **Not used.** `expo-location` is installed and configured with "Use your location when choosing where to meet", but nothing imports it | — | `mobile/app.json:57-64`; `mobile/package.json:36`; repo search finds no `expo-location` import |
| Motion and fitness | Never requested; a purpose string exists only because the location library needs it | — | `mobile/app.json:63` |
| Wellness | Fixed sample numbers; nothing measured | — | `mobile/app/(tabs)/wellness.tsx:14-19`; `mobile/app/data-privacy.tsx:133-136` |
| Preview mode | Actions stay on the device | — | `mobile/src/design/Chrome.tsx:10-25` |

## 12. Contacts: what exactly happens

1. Nothing is read until the person taps to choose phone contacts. Then the app asks for permission, if needed, and reads one page of 50 contacts with name, emails and phones (`mobile/src/services/contacts.ts:28-50,119-129`). iOS limited access is supported (`mobile/src/services/contacts.ts:90-98`).
2. The address book is never uploaded or stored as a whole. Pages live in memory on the picker screen.
3. When the person picks numbers, the app sends **only those numbers, as plain digits, not hashed**, to `contacts_on_resbite`, at most 50 per call and 500 per day (`mobile/src/services/contactInvites.ts:109-119`; `supabase/migrations/20261028120000_contact_invitations.sql:64-81`). The server answers which of them belong to app users. It does not store the lookup, only the day's count (`supabase/migrations/20261028120000_contact_invitations.sql:30-61`).
4. When the person invites, `invite_contacts` gets each number, calling code and a personal code (`mobile/src/services/contactInvites.ts:122-144`). For an app user, the server adds them to the guest list and keeps no number. For anyone else, it **stores the number in plain digits** in `private.phone_invitations` with a hash of the code (`supabase/migrations/20261028120000_contact_invitations.sql:114-128`). Names never leave the phone (`mobile/src/services/inviteCodeStore.ts:3-11`).
5. The app then opens WhatsApp or Messages with the number and invitation text (`mobile/src/services/inviteSend.ts:26-49`).
6. If a host later removes or revokes that person, the number may also go into `private.plan_removals` for the series (`supabase/migrations/20261111130000_circles_of_trust.sql:38-51`).
7. Neither table has an expiry. Plans are never deleted, so the cascade never fires.

**Side effect to disclose:** anyone who has a person's number can find out whether that person uses Resbite (within the 500-a-day limit; blocked people are excluded, `supabase/migrations/20261111160000_chat_safety.sql:725`).

## 13. The web site link.resbite.com (Vercel)

| Item | What happens | Evidence |
|---|---|---|
| Pages | `/r/<code>` (event link), `/i/<code>` (personal invitation), `/invite` (legacy), images, Apple app-site file | `links/generate.mjs:72-103` |
| Public data shown | Host name, title, time, area, place-to-be-decided flag, repeat, going count, cover photo. Personal page adds the invited number's calling code and last two digits | `supabase/migrations/20261031120000_creating_a_resbite.sql:247-264`; `supabase/migrations/20261028120000_contact_invitations.sql:194-215` |
| What a visitor types | 18+ tick and terms; phone number; the code; name; answer | `links/assets/personal.js:103-192` |
| Where it goes | Straight from the browser to Supabase Auth and REST (CSP allows only the Supabase host): `check_invited_number` (number compared, not stored), `/auth/v1/otp`, `exchange_test_code`, `/auth/v1/verify`, then `answer_phone_invitation` or `request_to_join` | `links/assets/personal.js:399-520`; `links/server/lib/personal.mjs:7-17` |
| Accounts made | A web-only Supabase account with phone, name, age tick, answer. Folded into the app account later if the person adds the same number | `supabase/migrations/20261028120000_contact_invitations.sql:245-305,333-381` |
| Browser storage | `localStorage` key `resbite.personal.session.<code>`: access token, refresh token, **full verified phone number**, and the event start. Dropped when the event starts, on "Not you? Sign out", or when unreadable | `links/assets/personal-flow.mjs:380-478`; `links/assets/personal.js:55-60` |
| Cookies | None set by the site's code | `links/assets/*.js` (no `document.cookie`) |
| Analytics, trackers, third-party scripts | None. CSP `script-src 'self'`; `Referrer-Policy: no-referrer`; `noindex` | `links/generate.mjs:9-16,106`; `links/server/lib/personal.mjs:107-131` |
| Server region | Vercel Functions default to Washington, D.C. (`iad1`) for new projects. `vercel.json` sets no region. Project setting UNVERIFIED | `links/generate.mjs:72-103`; [Vercel regions](https://vercel.com/docs/functions/configuring-functions/region) |
| Cover photo proxy | The image route uses the Supabase secret key to sign the cover and streams it to anyone with the link | `links/server/api/image.mjs:55-68` |
| Server logs | Request path (contains the code), search params, user agent | `docs/implementation-status.md:538`; [Vercel runtime logs](https://vercel.com/docs/logs/runtime) |

## 14. Third parties and vendors

| Vendor | Role | Personal data received | Location | Evidence |
|---|---|---|---|---|
| Supabase (Postgres, Auth, Storage, Realtime, Edge Functions, logs, backups) | Main processor | Everything in sections 2-9 | London `eu-west-2`. Edge Functions run nearest the caller (cron calls start in London) | `docs/implementation-status.md:30`; [Supabase regional invocation](https://supabase.com/docs/guides/functions/regional-invocation) |
| Expo push service (exp.host) | Push relay | Expo push token; push title and body (incl. chat text and first names); data ids. At registration Expo also receives the APNs device token | United States | `supabase/functions/_shared/notification-adapters.ts:16`; `mobile/src/services/pushDevice.ts:313-330`; [Expo](https://docs.expo.dev/push-notifications/sending-notifications/) |
| Apple Push Notification service | Delivers pushes | Device token; push content | Apple | Via Expo, [Expo](https://docs.expo.dev/push-notifications/sending-notifications/) |
| Sign in with Apple | Identity provider | Apple user id, email (or relay), name the first time | Apple | `mobile/src/services/appleSignIn.ts:66-72` |
| Google (OAuth through Supabase) | Identity provider, if enabled | Google id, email, name, picture | Google. Hosted enablement UNVERIFIED | `mobile/src/state/useAuthFlow.ts:234-258`; `qa/auth-readiness.md:13,19-33` |
| Resend (SMTP for Supabase Auth) | Sends Auth emails | Email address; confirmation link or code | Sends from a chosen region; stores data in the US | `qa/auth-readiness.md:74-80`; [Resend GDPR](https://resend.com/security/gdpr) |
| Vercel | Hosts link.resbite.com | Visitor IP, user agent, request paths with codes; cover photo bytes passing through | Default `iad1` (US); setting UNVERIFIED | `links/generate.mjs:1-2,106`; [Vercel](https://vercel.com/docs/functions/configuring-functions/region) |
| WhatsApp / Apple Messages | Opened by the host to send an invitation | Recipient number and text, by the user's own action | Meta / Apple | `mobile/src/services/inviteSend.ts:37-46` |
| Apple Maps | Opened to show the place | Place text (and coordinates if any) | Apple | `mobile/src/domain/eventView.ts:186-191` |
| SMS provider | None connected. Test mode stores codes instead | — (a future provider will receive every number) | — | `supabase/migrations/20261027120000_phone_accounts.sql:3-4`; `knowledge-base/08-decisions.md:391,398` |
| Analytics, crash reporting, advertising | **None** | — | — | `mobile/package.json:14-54`; repo search for Sentry, Firebase, Amplitude, PostHog, Mixpanel, Vercel Analytics: none |
| EAS (Expo build service) | Builds the app | No user data | — | `mobile/eas.json:1-12` |

## 15. Native SDKs, required-reason APIs and the privacy manifest

`mobile/app.json` has no `ios.privacyManifests` (`mobile/app.json:10-19`). These installed packages ship their own `PrivacyInfo.xcprivacy`:

| Package | Declared required-reason APIs | Declared collected data | Used by the app? | Evidence |
|---|---|---|---|---|
| react-native (React) | File timestamp C617.1; User defaults CA92.1 | None | Yes | `mobile/node_modules/react-native/React/Resources/PrivacyInfo.xcprivacy` |
| expo-application | File timestamp C617.1 | None | Transitive | `mobile/node_modules/expo-application/ios/PrivacyInfo.xcprivacy` |
| expo-constants | User defaults CA92.1 | None | Yes | `mobile/node_modules/expo-constants/ios/PrivacyInfo.xcprivacy` |
| expo-file-system | File timestamp 0A2A.1, 3B52.1; Disk space E174.1, 85F4.1 | None | Yes (photo files) | `mobile/node_modules/expo-file-system/ios/PrivacyInfo.xcprivacy` |
| expo-notifications | User defaults CA92.1 | None | Yes | `mobile/node_modules/expo-notifications/ios/PrivacyInfo.xcprivacy` |
| @react-native-async-storage/async-storage | File timestamp C617.1 | None | **Installed, never imported** | `mobile/package.json:17`; repo search |

Other native packages with privacy-relevant permissions: `expo-contacts` (built from source, `mobile/package.json:4-11`), `expo-image-picker`, `expo-calendar`, `expo-location` (unused), `expo-secure-store`, `expo-apple-authentication`, `expo-web-browser`, `expo-clipboard`, `expo-haptics`. A scan of their iOS sources found no other required-reason API calls (the only hit was an EventKit `creationDate` field, which is event data, not a file timestamp).

Apple's list of SDKs that need a manifest includes **Hermes**, React Native's engine ([Apple](https://developer.apple.com/support/third-party-SDK-requirements/)). Whether the built Hermes framework carries one is UNVERIFIED: check Xcode's privacy report from an EAS build. Expo says Apple does not always read manifests in static CocoaPods, and suggests `ios.privacyManifests` when Apple's upload email lists missing reasons ([Expo](https://docs.expo.dev/guides/apple-privacy/)). The 1 May 2024 date and the ITMS-91053 email are reported in Apple's forums, not confirmed from an Apple page here: UNVERIFIED ([forum](https://developer.apple.com/forums/thread/748271)).

Android settings in the same file ask for fine and coarse location and **write** contacts (`mobile/app.json:20-27`), none of which the code uses.

## 16. Draft Apple App Privacy answers

Definitions from [Apple's App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/): "collect" means sending data off the device so you or partners can access it longer than needed to serve the request in real time. Personal data under privacy law counts as **linked**. **Tracking** means linking with third-party data for advertising, or sharing with a data broker. Data collected by Apple need not be disclosed.

No data type below is used for tracking. All purposes are **App Functionality** unless noted. Nothing is used for advertising, analytics or personalisation today.

| Apple category | Data type | Collected? | What in Resbite | Linked | Evidence |
|---|---|---|---|---|---|
| Contact Info | Name | **Yes** | Display name; Apple/Google name; web answer name | Yes | §2, §3 |
| Contact Info | Email Address | **Yes** | Auth email (email, Apple, Google) | Yes | §2 |
| Contact Info | Phone Number | **Yes** | Verified phone; optional unverified phone; invited contacts' numbers. Apple counts even hashed numbers | Yes | §2, §5 |
| Contact Info | Physical Address | No (judgement) | The meeting place is free text the host types; declared under Other User Content | — | §4 |
| Contact Info | Other User Contact Info | No | — | — | — |
| Health & Fitness | Health, Fitness | No | Wellness is sample data | — | §11 |
| Financial Info | All | No | — | — | — |
| Location | Precise | No | App never reads device location; lat/long never sent | — | §4, §11 |
| Location | Coarse | **Judgement: Yes while "city" is collected** | Optional typed city. Remove the field to answer No | Yes | §2 |
| Sensitive Info | Sensitive Info | No | — | — | — |
| Contacts | Contacts | **Yes** | Chosen contacts' numbers sent and stored for invitations; connections are a social graph | Yes | §5, §12, `supabase/migrations/20261110120000_connections.sql:6-25` |
| User Content | Emails or Text Messages | **Yes** | Chat messages and announcements (Apple: in-app messaging counts) | Yes | §6 |
| User Content | Photos or Videos | **Yes** | Profile photos, cover photos | Yes | §3, §4 |
| User Content | Audio, Gameplay | No | — | — | — |
| User Content | Customer Support | **Yes once the support address is live** | Emails to support; report details | Yes | `mobile/app/data-privacy.tsx:25-28,138-147` |
| User Content | Other User Content | **Yes** | Titles, descriptions, places, meeting details, notes, cover descriptions, RSVP answers, reports, blocks | Yes | §4, §7 |
| Browsing History | — | No | — | — | — |
| Search History | — | No | Catalogue search runs on the phone | — | `mobile/src/services/liveCatalogue.ts:18` |
| Identifiers | User ID | **Yes** | Account UUID | Yes | §2 |
| Identifiers | Device ID | **Judgement: Yes** | Expo push token (a device-level id) | Yes | §8 |
| Purchases | — | No | — | — | — |
| Usage Data | Product Interaction | **Yes** | First and last app session; chat read position. Link-open counts are not linked | Yes | §3, §6, §5 |
| Usage Data | Advertising Data, Other | No | — | — | — |
| Diagnostics | Crash, Performance, Other | No (judgement) | No crash or performance SDK. Server request logs exist for operation only (Supabase 7 days, Vercel 1 h or 1 day) | — | §9 |
| Other Data | Other Data Types | **Yes** | Date of birth (optional), interests, 18+ attestation | Yes | §2, §3 |

## 17. Where the in-app Privacy page disagrees with the code

| In-app text | What the code does | Evidence |
|---|---|---|
| "Groups, selected contact details and prepared invitation links stay on this device." | Invited non-users' numbers are stored on the server, with no expiry | `mobile/app/data-privacy.tsx:57-59`; §12 |
| "Phone numbers entered here are not verified and do not enable SMS sign-in." | True for the optional field, but phone sign-in now exists and is the main route; the page never mentions the verified number | `mobile/app/data-privacy.tsx:83-89` |
| "Resbite counts how many times an event's link is opened in the app. It does not record who opened it." | True for the counter. Supabase and Vercel request logs still hold request details for a short time | `mobile/app/data-privacy.tsx:107-108`; §9 |
| Not mentioned | Connections, refusals, join requests, chat text in pushes to a US service, "On Resbite" discoverability, web localStorage, vendors, retention periods, test mode | §5, §8, §12-14 |
| "Previous uploads remain in private storage until file cleanup is enabled." | Accurate; clean-up is still local-only. Covers have no clean-up at all | `mobile/app/data-privacy.tsx:99-101`; §10 |
| Contact topic | Hidden: `EXPO_PUBLIC_SUPPORT_ADDRESS` is unset | `mobile/app/data-privacy.tsx:25-28,138-147`; `mobile/.env.example` (name only) |
| Terms and Privacy Policy links | Plain words unless `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL` are set | `mobile/src/design/TickRow.tsx:60-70` |

## 18. Starting point for the records of processing

UK GDPR Article 30(1) asks for purposes, categories of people and data, recipients, transfers, time limits and security ([legislation.gov.uk](https://www.legislation.gov.uk/eur/2016/679/article/30); page did not render for this audit: UNVERIFIED wording). Lawful bases are for legal review.

| Activity | People | Data | Recipients | Transfers outside UK | Time limit today |
|---|---|---|---|---|---|
| Accounts and sign-in | Users | §2 | Supabase, Resend, Apple, Google | US (Resend storage) | None |
| Planning resbites | Users | §4 | Supabase; Vercel for public link data | US (Vercel default region) | None |
| Inviting by phone | Users; **non-users** | §5, §12 | Supabase; WhatsApp/Messages by user action | — | None |
| Chat | Users | §6 | Supabase; Expo, Apple (pushes) | US (Expo) | None |
| Safety and moderation | Users, reported people | §7 | Supabase; owner | — | Closed reports 180 days (manual) |
| Notifications | Users | §8 | Supabase, Expo, Apple | US (Expo) | Expo receipts 24 h; own tables none |
| Phone verification (test mode) | Anyone entering a number | §9 | Supabase | — | None |
| Logs and backups | Users, web visitors | §9 | Supabase, Vercel | US (Vercel) | 7 days / 1 h-1 day |

## 19. Open questions and UNVERIFIED items

- Is the Google provider enabled on the hosted project? The last record says "Disabled" (`qa/auth-readiness.md:13`), but the button ships.
- Which Vercel plan and function region does link.resbite.com use?
- Do Supabase API gateway logs hold IP addresses and user agents? The docs pages fetched do not say.
- Does the EAS-built app carry a Hermes privacy manifest, and does Xcode's privacy report list every bundled manifest?
- Is `private.phone_rewrites` populated on hosted (was the Argentine rewrite script run)?
- Exact Google `user_metadata` fields stored by Supabase (picture URL) are from general knowledge, not a fetched page.
- Resend's own retention of sent-email logs.
- UK GDPR Articles 5 and 30 text: legislation.gov.uk returned empty pages to the fetcher; the ICO storage-limitation page returned 403.

## Sources

- Apple, App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Apple, Offering account deletion in your app: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple, Third-party SDK requirements: https://developer.apple.com/support/third-party-SDK-requirements/
- Apple Developer Forums, privacy manifest thread (UNVERIFIED enforcement details): https://developer.apple.com/forums/thread/748271
- Expo, Privacy manifests: https://docs.expo.dev/guides/apple-privacy/
- Expo, Sending notifications (US hosting, 24 h receipts): https://docs.expo.dev/push-notifications/sending-notifications/
- Expo, SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/
- Supabase, JWT fields: https://supabase.com/docs/guides/auth/jwt-fields
- Supabase, Auth audit logs: https://supabase.com/docs/guides/auth/audit-logs
- Supabase, Logs: https://supabase.com/docs/guides/telemetry/logs
- Supabase, Pricing (7-day logs, backups and Auth audit on Pro): https://supabase.com/pricing
- Supabase, Edge Function regional invocation: https://supabase.com/docs/guides/functions/regional-invocation
- Vercel, Function regions: https://vercel.com/docs/functions/configuring-functions/region
- Vercel, Runtime logs: https://vercel.com/docs/logs/runtime
- Resend, GDPR (data stored in the US): https://resend.com/security/gdpr
- Resend, Regions: https://resend.com/docs/dashboard/domains/regions
- legislation.gov.uk, UK GDPR Article 30 (not rendered; UNVERIFIED): https://www.legislation.gov.uk/eur/2016/679/article/30
