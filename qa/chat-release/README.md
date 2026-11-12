# Chat: release runbook (12 November 2026)

- **Spec:** [Groups and chat design](../../docs/superpowers/specs/2026-11-10-groups-and-chat-design.md) (CH-D1 to CH-D6, CH-P1 to CH-P19; screens CH-01 to CH-08; mockup `group-chat.html`).
- **Plans:** [chat 1, core](../../docs/superpowers/plans/2026-11-11-chat-1-core.md), [chat 2, groups](../../docs/superpowers/plans/2026-11-11-chat-2-groups.md) and [chat 3, safety](../../docs/superpowers/plans/2026-11-11-chat-3-safety.md). The [roadmap](../../docs/superpowers/plans/2026-11-11-roadmap-connections-groups-chat.md) (Phase 3) ships the three in **one release**.
- **Code:** chat core is on branch `ch1-core`, stacked on the circles branch `co2-circles-of-trust`. Chat groups (plan 2) is on branch `ch2-groups`, stacked on chat core. Chat safety (plan 3) is on branch `ch3-safety`, stacked on chat groups; its head holds the three plans' work, integrated. **Nothing is applied to the hosted project, Supabase functions, the Realtime settings, Vercel, EAS, TestFlight or App Store Connect.** Every step below needs the owner's explicit approval when it is done. No build task executed any of them.
- **App Review:** [`app-store-review-notes.md`](app-store-review-notes.md), beside this file, is pasted into App Store Connect at step 6a.

**This runbook is whole.** It holds chat core (plan 1), chat groups (plan 2) and chat safety (plan 3), and it is run as one release, in the order under "Rollout runbook": the owner's answers, the three migrations in one sitting, the sender, Realtime, the team's lists and the support address, then one TestFlight build and App Review.

**Chat core is not meant to go live on its own** (plan Decision 4).
- History: chat core alone would let a repeating series follow the one-off rules on its current occurrence, and the real weekly roll would write an `admin` line, with no actor, into the chat for each admin it carries (`private.plan_admins_chat_lines`, `supabase/migrations/20261111140000_chat_core.sql:984-993`). Plan 2 ships in the same sitting and ends both: a repeating series is a group, and its roll sets the roll flag, so it writes no line for anyone it carries.
- Report and block (plan 3) ship in the same sitting and the same build. Chat never reaches testers or App Review without report, block, the chat rules, the blocked terms and a contact address (App Store guideline 1.2, CH-P13, the spec's Anti-goals): steps 5a, 5b and 6a gate the build.
- So the three migrations go in one sitting, in order, and the app reaches testers in one TestFlight build.

## What is built (chat core)

- **One hosted-compatible migration**, `20261111140000_chat_core.sql`. It depends on the files in `supabase/tests/hosted-baseline/migrations.txt`, the follow-ups migration and the circles migration. It calls `private.first_name` (circles) and copies the circles bodies of the claim, the fold and the deletion request.
  - It writes one row per existing series into `public.chats` (the backfill, line 97) and nothing else.
  - It never creates Realtime. It uses the hosted project's `realtime.send` and `realtime.messages`. Locally a stub in `supabase/tests/local/bootstrap.sql` stands in.
- **Four tables**, each with RLS on, no policy and no grant to any API role (lines 30-115): `public.messages`, `public.chats` (one row per series, with `is_group` false throughout plan 1), `public.chat_reads` and `public.chat_mutes`. The app reads and writes only through functions (Decision 2).
- **Who is in a chat** is computed on the series' current occurrence (`private.chat_member`, line 132): the owner, the admins, and guests who are Going or Maybe. A one-off's chat closes 48 hours after its end, or at once when cancelled (`private.chat_closes_at`, `private.chat_open`, lines 156-169).
- **Ten calls for signed-in accounts:**
  - the reads: `chat_summary`, `chat_messages`, `chat_messages_since` and `my_chat_overview`;
  - the writes: `send_message`, `send_announcement`, `delete_message`, `remove_message`, `mark_chat_read` and `set_chat_mute`.
  - Each public call is an invoker over a private definer with an empty `search_path`.
- **Writing** (lines 444-562):
  - a repeat of a client id returns the stored row, even after the close;
  - 1 to 1,000 characters with at least one visible (`private.chat_body`, line 433); over 16,000 bytes is refused before any pattern runs (line 434, H42);
  - 30 messages and announcements a minute per person (`22023 'Slow down'`), and one announcement a minute per person per chat (`22023 'Too fast'`).
- **One push a minute is decided when the message is written** (Decision 6). Under the chat's lock, `send_message` queues no `chat_message` notice for a person who already has one for that chat from the last 60 seconds (lines 494-501). An announcement is always queued for its audience.
- **Delete and remove** (lines 573-607) keep the row and drop the words. Both work after the close (K-S17, the owner's question in step 0). A host's own message is deleted, never removed.
- **System lines** are written by triggers on `public.attendees`, `public.plans` and `public.plan_admins`, in the same transaction as the change (lines 894-993): joined, can't go, admin, changed and cancelled. The roll's and the deletion's flag (`resbite.system`) silence them.
- **The live signal.** `private.messages_signal` broadcasts `{id, kind, state}` on the private channel `chat:<series_id>` after every insert or update of a message (lines 1101-1111).
  - Its `perform realtime.send(...)` sits in a block that turns any error into a WARNING (lines 1103-1107). So a broadcast never stops a write.
- **The Realtime policy** `chat_members_listen` on `realtime.messages` (lines 1130-1132), for reading, to `authenticated`. Three conditions must hold:
  - the row is a broadcast;
  - the row is on the very topic being joined;
  - `private.can_listen` allows it. `can_listen` (lines 1117-1125) requires the topic to be exactly `chat:<lower-case uuid>` before any cast, the caller to pass `private.user_eligible`, and the caller to be in that chat now.
- **The notices.** Two new outbox kinds, `chat_message` and `announcement`, each with its `message_id` (line 378). Who may be told gets a chat branch (lines 652-692):
  - the message is still sent and its plan is not cancelled;
  - a `chat_message` is under an hour old, and its recipient is in the chat and has not muted it;
  - an announcement is under a day old, and its recipient is in its audience now;
  - Mute this resbite silences both.
- **The sender's side of the database.**
  - The claim expands every other kind before the chat kinds, and picks every other kind's deliveries first (lines 712 and 743, H42), so a change is never queued or sent behind a lively chat.
  - It makes no delivery for a `chat_message` its recipient has already read (lines 714-717, H42). The read is checked once, at the expansion: a read after that still gets its push.
  - It returns `series_id`, `message_id`, `message_body` and `audience` (lines 761-763).
  - `finish_notification_delivery` gains the outcome `deferred` (lines 780-803): a job the sender could not start goes back to pending at once, and the attempt the claim counted is given back.
- **Account deletion**, only where the local deletion lifecycle exists (`to_regprocedure` guard, lines 814-877). On the hosted project there is none, and nothing is done.
  - The flag goes up first (line 837).
  - A deleted account's messages and announcements then lose their words and their author (line 866).
  - Its reads and mutes go (line 868).
- **A profile that goes any other way** (by hand, the only way an account can go on hosted today) loses its words too: when a message's or an announcement's author becomes nobody, `private.messages_touch` empties it and a sent one reads deleted (lines 62-70, H42). The count and the pin follow.
- **The fold** (`fold_web_account`, line 1000) moves a web account's messages and its place in the chat's lines to the app account (lines 1079-1087). It moves an author, never empties one, so the words stay.
- **The sender** (`supabase/functions/_shared/`, rides the redeploy of step 4):
  - **The words** (`notification-copy.ts:159-165` and `:173-176`). A chat push reads "<first name>: <words>" and an announcement "Announcement from <first name>: <words>", under the resbite's title.
    - The words are made one clean line and cut at 120 graphemes, and the name at 30.
    - With no name or no visible words, the push is the generic one.
  - **The tap data** (`notification-engine.ts:71-78`). A chat push's data is `{type: "chat", seriesId, planId, notificationId}`. A chat job without a valid series id is never sent (lines 88-97).
  - **The claim loop.** The first claim takes 25, later claims take 10, and no claim, send or receipt check starts once 5 seconds have passed (`budgetMs = 5_000`, `notification-engine.ts:133-176`). Each claimed job not yet started is finished as `deferred`.
- **The app** rides the TestFlight build (step 6):
  - the `/chat` screen;
  - the Chat row on the resbite page;
  - the unread dot and the announcement line on My resbites;
  - push taps and in-app banners for chat;
  - the When sheet's "The chat closes 48 hours after the end time.";
  - the notification ask on a chat's first open;
  - the Chat messages topic on Data & privacy.
  - The sample conversation is gone.

The decisions and the calls made while building are in the [decision log](../../knowledge-base/08-decisions.md), under Chat core.

## What is built (chat groups)

- **One hosted-compatible migration**, `20261111150000_chat_groups.sql`, in two sections. It depends on the files in `migrations.txt` and the follow-ups, circles and chat core migrations.
  - Every body it replaces is copied from its latest definition as built and changed only where its comment says: chat core's (sha256 `1047fb37…`), the circles roll (sha256 `04062e2b…`), the follow-ups `request_connection` and the creating-a-resbite `can_see_guests`.
  - It writes data twice, in the backfill (lines 156-161): every series with an occurrence that repeats, or that was rolled from another, becomes a group; and a group whose current occurrence no longer repeats gets a stop time, that occurrence's end, no later than now.
- **A group is a repeating resbite** (CH-D1). `public.chats.is_group` is set by the backfill and by the trigger `plans_group_flag`, and never goes back to false (CH-P1).
- **Who is in a group's chat** (CH-D3, `private.chat_member`): its hosts and every guest row of its current occurrence, whatever this week's reply. A one-off's chat is as built.
- **When a group's chat closes** (CH-P15, `private.chat_closes_at`, `private.group_stopped`): never while it repeats. It closes 48 hours after the last end once it stops: by Edit → "Doesn't repeat", by "Cancel this and stop repeating" (48 hours after the cancellation), or when its owner may no longer use the app (Decision 4). "Cancel just this one" keeps it open (CH-P15).
- **Leaving** (CH-P4, `leave_series`, for signed-in accounts): a member who isn't a host leaves the group. Their guest row on the current occurrence goes with its personal links, the live links to their confirmed number, their admin row and their `invited` notice. The chat writes "Sol left the group", and nobody is pushed. The leave is the roll's skip list (`private.series_leaves`), and any way back in clears it (Decision 1).
  - Someone who leaves after the current occurrence ended keeps that row and is out of the chat at once (Decision 2).
  - Refused for anyone not in the group, a host or the owner, before any plan is locked.
- **Whether the resbite page is a group's** (`series_is_group`, for signed-in accounts): true for a member of a group, false otherwise and for anyone who may not use the app.
- **The group's lines** (Decisions 3 and 6): "Board game night ended" and "Next one: Thu 20 Nov · Ana's flat" from the roll; "Sol can’t make it this week", taken back by state within 10 minutes; "Sol left the group"; "Ana cancelled this Thursday" and "Ana cancelled the group"; "Ana stopped repeating this · the last one is Thu 27 Nov", removed when the repeat comes back (Decision 12); "Ana made this a group · everyone invited can read this chat".
- **The roll** (`private.roll_repeating_plans`, the circles body): it sets the roll flag, so it writes no "joined" or "admin" line for anyone it carries, and writes "ended" and "Next one" itself. It skips everyone in the leave record, drops a "brought by" that points outside the group (Decision 5), never resumes a closed group (ruling GR3), and takes its plans in series order.
- **Who sees a group's people** (`private.can_see_guests`, CH-P21): every member, answered or not. A member may ask anyone in the group to connect, only while that person is still in it (`private.request_connection`).
- **Pushes** (`private.notification_recipient_eligible`, Decision 7): a group's open chat pushes in a cancelled week, and in the 48 hours after it stops. A cancelled one-off still pushes nobody.
- **The place** (`private.chat_row`, Decision 11): a member who hasn't answered reads no `place_label` in a "Next one" or place-change line. Every row carries its `plan_id`.
- **The pin and the invitation card** (`private.chat_summary`, `private.my_chat_overview`, ruling GR4): a group's pinned announcement, and the announcement under an invitation on My resbites and the resbite page, are only the current occurrence's. Last week's no longer heads next week's chat or invitation.
- **The sender:** no change of this plan's own.
- **The app** rides the TestFlight build (step 6):
  - the chat screen on a group: the header "Every Thursday · 9 in the group" (or "Last one · Thu 27 Nov · 9 in the group"), the group's field line, the audiences "Everyone in the group" and "Going this Thursday", the group's cards, the owner-alone empty state, "People in this group · 9", the closed card, and "Next one" as a button that opens this week's resbite;
  - Leave group in the chat's menu, and Leave this group in the resbite page's More, each asking in place. Either way the phone's reminders for it go, My resbites drops the group at once, and the person lands there from the group's chat, resbite page or people list, even if they moved between them while the leave was on its way;
  - an earlier week's "cancelled" line names that week's date ("Ana cancelled Thu 20 Nov") and its "can't make it" line reads in the one-off words, never "this Thursday" or "this week" above next week's "Next one";
  - the resbite page shows at once, as a one-off's, and turns into the group's when `series_is_group` answers;
  - the resbite page's "Group chat" row, the people row's names and the people list's "Not answered yet" for every member;
  - the unread dot on a group member's invitation card on My resbites;
  - the When sheet hides "The chat closes 48 hours after the end time." while the resbite repeats.

The decisions and calls are in the [decision log](../../knowledge-base/08-decisions.md), under Chat groups.

## What is built (chat safety)

- **One hosted-compatible migration**, `20261111160000_chat_safety.sql`, in two sections: blocks (section 1, lines 20-745), then reports, the moderators, the chat rules, the blocked terms, the deletion and the fold (section 2, lines 747-1444). It depends on the files in `migrations.txt` and the follow-ups, circles, chat core and chat groups migrations.
  - Every body it replaces is copied from its latest definition as built and changed only where its comment says (the plan's Bases; its header, lines 7-17): plan 2's `chat_summary`, `my_chat_overview`, `request_connection` and `notification_recipient_eligible` (sha256 `068d7f42…`); chat core's `chat_messages`, `chat_messages_since`, `send_message`, `send_announcement`, the worker's claim, the deletion request and the fold (sha256 `1047fb37…`); the connections' `plan_connection_states`, the circles' `invite_contacts` and the phone_key's `contacts_on_resbite`. Fourteen bodies; thirteen on hosted, where the deletion request doesn't exist.
  - It writes no data. Its six tables start empty: no term and no moderator is seeded.
- **Six tables in `private`**, each with RLS on, no policy and no grant to any API role: `blocks`, `reports` (and its id sequence), `suspensions`, `moderators`, `chat_rules_acceptances` and `blocked_terms`. No public table.
- **Five calls for signed-in accounts**, each a public invoker over a private definer with an empty `search_path`, for `authenticated` only: `block_user` (block or unblock; it answers `stored`, true only when the caller's block exists afterwards), `my_blocks` (`{user_id, name, at}`, newest first), `report_message`, `report_user` and `accept_chat_rules`. Four helpers no API role may call: `invited_by`, `inviter_of`, `chat_rules_version` (`'2026-11'`) and `report_keep_days` (180).
- **A block** (plan Decisions 1, 2, 11, 17 and 18):
  - the blocker no longer sees the blocked person's messages and announcements: in the history (filtered before the page's limit, so a page still holds 50 rows the blocker may see), the pinned card (an earlier announcement takes the pin; on a group, only the current occurrence's), the Chat row's line, the counts and unread, and the invitation card's announcement line;
  - no push from the blocked person reaches the blocker, join requests included, and none names them: a host who blocked a guest's bringer reads "Clara is going.". The resbite's own news (`plan_changed`, `plan_cancelled`, a group's "<title> is on again") still arrives. The blocked person's messages use up none of the blocker's one push a minute;
  - a block ends a connection and refuses new ones, both ways, before every accept path (CO-P14);
  - **the blocked person is never told** (CH-P13). The block reads to them as a refusal ("Request sent"), as a removed connection, or as a number not on Resbite, in the contact lookup and in an invitation (Decision 11);
  - Unblock deletes the caller's own block, whatever the two share now. No connection comes back;
  - a blocked person's join request still shows to every host, the blocker included, who can decline it.
- **Reports** (Decisions 4 to 7, 13 and 16):
  - `report_message` freezes the message's words and author; a later delete changes nothing in the report. It works on a closed chat. One's own message, a system line, or a message no longer sent: `22023 'Report unavailable'`;
  - `report_user` reports a person on a series: someone the caller sees there, an author in the caller's chat, the owner or the person who invited an unanswered invitee (R-Q1), an announcer whose audience holds the caller, or the sender of a waiting connection request;
  - one report per person per message, and one open report per person about a person on a series: a repeat answers the same thanks and stores nothing. At most 20 reports per account per 24 hours (`22023 'Report limit'`);
  - a reason outside the four, or details over 500 characters: `23514 'Invalid report'` with no detail, so no row is ever echoed to the caller or the log (ruling SR3);
  - the reports an account filed go with it, however it goes (CH-P18): the deletion step, and `on delete cascade` from a profile removed by hand. Reports about it keep its id and the frozen words until they are closed;
  - a closed report is deleted 180 days after closing (R-Q3), by `purge-closed-reports.sql` when the queue says one is due.
- **The moderators' push** (Decisions 10 and 16). Each new report queues `report_filed` to every moderator but the reporter and the reported person, at most one per moderator in 10 minutes. It is eligible for 24 hours while the moderator may use the app, carries the report's resbite as its `plan_id` and nothing else of the report, and is claimed and sent before any chat push. No mute applies to it.
- **The chat rules** (Decision 8). A first message or announcement waits for the person to agree to version `2026-11`: `send_message` and `send_announcement` refuse with `22023 'Rules not accepted'` right after the open check, and `chat_summary` gains `rules_accepted`. A repeated client id still returns its stored row first.
- **The blocked terms** (Decision 9). A message or announcement holding a listed term as a whole word, in any case, is refused before it is stored (`22023 'Not allowed'`). A space in a term matches any run of blanks or a line break. Titles, notes to guests and names are not checked (challenge N4). A term is 1 to 80 characters, a letter, digit or underscore first and last, its words one space apart, with no regex character.
- **Deletion and the fold.** The deletion request (local only, as chat core's) also deletes the person's blocks both ways, the reports they filed, their acceptances and their moderator row. The fold moves the web account's blocks and reports to the app account, keeping each block's time, and drops a report between the two accounts (challenge I4). Both take guest rows before blocks and reports, in one order.
- **The team's scripts**, plain SQL for the hosted project's SQL editor (`supabase/ops/`, G-S12). Each is one statement, so one transaction, with one literal or list at the top to edit in the editor's copy only (`open-reports.sql` and `purge-closed-reports.sql` have none): `open-reports.sql` (the daily read: the open reports, the last 7 days' blocks and a `due` row), `close-report.sql`, `remove-reported-message.sql`, `suspend-account.sql` (with its undo), `moderators.sql`, `blocked-terms.sql` and `purge-closed-reports.sql`. They print counts or rows, never a phone number or a reported person's email. `blocked-terms.sql` prints no term, even on a refused run. How the team uses them is under "The reports queue".
- **The sender** (`supabase/functions/_shared/`, rides the redeploy of step 4): `report_filed` reads "A new report is waiting." under "Resbite" (`notification-copy.ts:167-171`), with the tap data `{type: "report", notificationId}` (`notification-engine.ts:70`): no resbite and no word of the report. Its tap opens nothing.
- **The app** rides the TestFlight build (step 6):
  - in a chat: Report message on a message's long-press and in VoiceOver's actions; a person's sheet, from the author's name over a bubble or an announcement or from the menu's Report or block (hidden when nobody else is in the chat), with Report <name> and Block <name> or Unblock <name>;
  - on an unanswered invitation: the card's long-press on My resbites, and the resbite page's Report or block, beside the announcement line and in More. They offer Report message, and Report and Block for the announcer, the person who invited them and the owner;
  - the people list (People in this chat, or People in this group · N): Report, and Block or Unblock. Connections: Report and Block on a request card's •••, and Block on a connection's •••;
  - the report sheet (four reasons and an optional line of up to 500 characters; the thanks shows the support address), and the block confirm, which tells a host what a block doesn't do (R-Q6);
  - the chat rules sheet before a first message or announcement; after a refusal it says what wasn't sent;
  - a block or unblock made anywhere refreshes every open chat at once (Decision 17);
  - Data & privacy: the Contact topic (the address as selectable text, Copy address and a mail link, only when `EXPO_PUBLIC_SUPPORT_ADDRESS` holds an address), what a report keeps, how long blocks stay (R-Q7), and Blocked people, with each block's date and Unblock;
  - "Message removed by Resbite" for a message the team removed; the moderator's push shown while the app is open, and cleared from Notification Center at sign-out.

The decisions and calls are in the [decision log](../../knowledge-base/08-decisions.md), under Chat safety.

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261111140000_chat_core.sql` | `1047fb379a4e8a942b49db3f7134674caecf2cbb30f67e0ebf9f0f2fea6a78ce` |
| `supabase/rollback/20261111140000_chat_core.rollback.sql` | `d212e53eacb904a260bbdd3c371ddc7424829ea7a5b7d6c98b3e7c89fb132214` |
| `supabase/tests/hosted-baseline/20261111140000_chat_core.before.sql` | `e498c9f396a5fb1371422f9cb7f00e39ac900edc51e08aadb2a73d33d3c64db6` |
| `supabase/tests/hosted-baseline/20261111140000_chat_core.after.sql` | `cabc541b71e8300a683e9582a6de351687664f65ebdfea36ba138b35dcc5010d` |
| `supabase/migrations/20261111120000_connections_follow_ups.sql` (applied by [its runbook](../connections-follow-ups-2026-11-11/README.md)) | `72d1536db56c956ade36844c9d4c715fffa9222090c0cb64226166fff39ae3d6` |
| `supabase/migrations/20261111130000_circles_of_trust.sql` (applied by [its runbook](../circles-of-trust-2026-11-10/README.md); plan 2's roll and plan 3's `invite_contacts` copy its bodies, I9) | `04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256` |
| `supabase/migrations/20261111150000_chat_groups.sql` | `068d7f42432862749646b4f7972e6cc9bc226d2670ca82d96610fd3b66759f23` |
| `supabase/rollback/20261111150000_chat_groups.rollback.sql` | `100f23695dd9e5d417b10f2ca5c2668864b391a81503d1bebde3a1fd884190aa` |
| `supabase/tests/hosted-baseline/20261111150000_chat_groups.before.sql` | `5b7ea7535c13d14bd851ed4bb13f7adb4ec09cf00e332775ab9f0d32ee46abc4` |
| `supabase/tests/hosted-baseline/20261111150000_chat_groups.after.sql` | `f17999bc73863f2e5ac1fa555c30fa2e3dbc5ea46e609c3a8b30a9d1b7c14656` |
| `supabase/migrations/20261111160000_chat_safety.sql` | `f8cfb5a62783528636aae2b8c461f150f8ae8f0553219d42b4b991bf66f2a2b2` |
| `supabase/rollback/20261111160000_chat_safety.rollback.sql` | `990cc9b0d0391173c888dc2155044795b4fbadd5d1b47131223dcc417e40a1d6` |
| `supabase/tests/hosted-baseline/20261111160000_chat_safety.before.sql` | `ed294a31dd9d44561464e8e941c0435b281240bae88abd7c3f281bf3ef6cbfa7` |
| `supabase/tests/hosted-baseline/20261111160000_chat_safety.after.sql` | `d2ab7ceaf27a563e26990b21622d3a79a64a56168dff21d73cc87a7e89a80160` |
| `supabase/ops/open-reports.sql` (the reports queue) | `ed84a165a73f573563a4434b4d00a47a062fd1d52dfac5c2b06543a21719b72a` |
| `supabase/ops/close-report.sql` (the reports queue) | `d07453d18c20803cfdf5c45c69ae554306564c881e257a6c1d3a02687e7661eb` |
| `supabase/ops/remove-reported-message.sql` (the reports queue) | `a7f88ed741c4256b6dae876243e66feb4abcb712317b839aa0af542d514e7210` |
| `supabase/ops/suspend-account.sql` (the reports queue) | `0715e65be38f596f7fb437b041cda9b8a2dc94338764e39f94bc1eae11a538d6` |
| `supabase/ops/purge-closed-reports.sql` (the reports queue) | `83d4397decd8d84dcd2c922936666b0f67ef76ca58c9215b1e7abb173d8a469a` |
| `supabase/ops/moderators.sql` (step 5a) | `4fb9ccfbe2e9298b77c84552895dca89b825753dbf21fad712a6a7ef2f8e312f` |
| `supabase/ops/blocked-terms.sql` (step 5a) | `f0124e1b02050bbc45905fb10c74e9ea7db889df3c27e9c50635f56f15fe29e4` |
| `supabase/migrations/20261110120000_connections.sql` (live; plan 3's `plan_connection_states` copies its body) | `1f403e42f97e9c2b619fe7a5d778bee0dfd2146d7fffc5a2114b24cb32d112d8` |
| `supabase/migrations/20261030130000_phone_key.sql` (live; plan 3's `contacts_on_resbite` copies its body) | `d7cf188f6b63d14453a2b34d6c8c85838ed196d7a06e01e3bd94c66ae0a14667` |
| `supabase/ops/hosted-fingerprint.sql` (unchanged) | `0778c53f98bc1cbdcee82487651dabc3fa246674a5d0efa1d6502e7746819a00` |
| `supabase/ops/hosted-counts.sql` (unchanged) | `15fe76aecba6bb5104d8795338c1ecaee9bd07ec9a2a9b7aba728e2bdae8c4a0` |
| `supabase/ops/schedule-deliver-notifications.sql` (unchanged; step 0's question) | `b87d60d02b78bc7e0603b563bbc71492385c03ee0540427b952759645524608a` |

The before/after pair is the rehearsal, run locally only. Recompute before asking for approval (`sha256sum <file>`). Approve by file name and hash, and stop if a hash differs.

- **Plan 3's bases.** The chat safety migration copies fourteen bodies from five files, each checked at its hash in this table before it was copied, and its rollback restores each byte for byte: plan 2's migration (`068d7f42…9f23`: `chat_summary`, `my_chat_overview`, `request_connection`, `notification_recipient_eligible`), chat core's (`1047fb37…a78ce`: the two history reads, the two writes, the claim, the deletion request and the fold), and the connections' (`1f403e42…12d8`), circles' (`04062e2b…7256`) and phone_key's (`d7cf188f…4667`), one body each.
- **The seven scripts in `supabase/ops/`** are pasted into the SQL editor, so their hash is checked by eye: compare the file's `sha256sum` with this table before copying it, and edit only the editor's copy.

## Checks made locally (12 November 2026)

The database suites, the edge tests, the fingerprint replay and the scripts' rehearsal ran on `ch1-core` at `2bb3929`: chat core's eight build tasks and the final fix wave (H42). The app check and the browser scripts ran at `99d4035`, before it; the server fix wave changed no app code.

- Full mode passes, 45 PASS lines: 29 SQL files, 15 race lines and the final line. They include `chat.sql` and `chat-send-concurrency.sh`, whose six lines cover these races:
  - the same message sent twice at once is one row;
  - a send meeting its own commit returns that row;
  - two writers give each member exactly one chat notice;
  - a removal and an account deletion queue on the chat's row;
  - a host losing the role while a removal waits is refused;
  - a send waiting on a plan's row holds no chat row, so a line writer holding the plan takes it, answers, and both go through (H42).
- `chat.sql` holds the final fix wave's cases (H42): 44 chat notices then 44 changes, where the first claim of 25 is all changes and no claim takes a chat job while a change that is due waits; a message read before the claim makes no push, and one read after still does; a profile deleted by hand leaves none of its words; and over 16,000 bytes is refused, 16,000 kept.

  ```
  bash scripts/test-database-docker.sh
  ```

  - Six `messages_signal: no broadcast for message …` WARNINGs are expected (`chat.sql:2083-2111`). They come from the tests that break `realtime.send` on purpose: each write still commits.
- The hosted baseline passes with the three candidates named, in order, 25 PASS lines. Each before file passes on the baseline, each migration applies and each after file passes.

  ```
  bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261111120000_connections_follow_ups.sql supabase/migrations/20261111130000_circles_of_trust.sql supabase/migrations/20261111140000_chat_core.sql
  ```

  - Name all three. Bare, this mode fails by design until all three are live: `tests.txt` lists their tests.
  - `.before.sql` asserts step 1's Realtime checks against the stub: `realtime.send(jsonb,text,text,boolean)` resolves, `realtime.messages` has `extension` and `topic`, and no policy exists in `realtime`.
  - `.after.sql` asserts:
    - exactly one policy on `realtime.messages`;
    - no role holds any table privilege on the four tables or the id sequence;
    - the ten calls are for `authenticated` only, and every private function is a definer with an empty `search_path`;
    - the seven triggers;
    - the redefined functions keep their grants.
  - It then rehearses the rollback in a transaction it rolls back. The guard refuses while a stand-in `private.series_leaves` exists, and changes nothing. Run for real, the rollback restores each redefined function, the outbox's check, columns and indexes and the triggers exactly, and removes the policy, the four tables, the functions and the chat notices. The resbites, the guest and an ordinary notice stay.
- The app check passes (at `f9ee5ff`, after the final fix wave): the typecheck, 1,036 tests in 92 runs, and the content validation.

  ```
  (cd mobile && npm run check)
  ```

- Every edge test file passes, 11 files and 107 tests, run from the repository root:

  ```
  node --import ./mobile/node_modules/tsx/dist/loader.mjs --test $(find supabase/functions -name "*.test.ts" | sort)
  ```

- **The browser scripts** passed during the build, against a fake project URL with every Supabase request stubbed. They were not run again for this task. The last runs are `verify-chat.mjs` 46 (at `fa211c8`, after the final fix wave), `verify-event.mjs` 23, `review-ui.mjs`, `verify-rsvp.mjs`, `verify-circle.mjs`, `verify-connections.mjs`, `verify-contact-invites.mjs`, `verify-planning.mjs` and `verify-account.mjs`. The Realtime socket is answered by `page.routeWebSocket`.
- **The fingerprint, on a local replay** (Docker, `supabase/ops/hosted-fingerprint.sql` with `psql --csv`).
  - `migrations.txt` alone gives 355 objects. With the follow-ups file there are 356, and with circles 387.
  - With chat core there are 464. From 387, 77 objects are added:
    - 41 functions: the ten public calls with their ten private bodies, and 21 private helpers and trigger functions;
    - the four tables, and 14 constraints and 11 indexes (the outbox's `message_id` foreign key and its two new indexes among them);
    - the seven triggers.
  - Six change by definition: `claim_notification_deliveries`, `finish_notification_delivery`, `private.fold_web_account`, `private.notification_recipient_eligible`, the outbox table (its `message_id`) and its `notification_outbox_kind_check`.
  - Nothing is removed and no grant changes. On the replay, which has no plans, `public.chats` has 0 rows.
  - The fingerprint covers `public` and `private` only. The Realtime policy is outside it, so steps 1 and 3 check it by its own queries.
  - The rollback, wrapped as below, gives back the 387 exactly, and leaves no policy in `realtime`. Run again, it passes its guard, fails at its `lock table` (`public.messages` is gone), and changes nothing.
- **The scripts below, rehearsed.** Each ran on a local replay through a stand-in for the CLI that sends each query to the local database. Small stand-ins took the place of the history table, `cron.job`, `cron.job_run_details` and `net._http_response`, which only hosted has. Two testers each owned a one-off.
  - With circles not yet applied, `ch1-apply.sh` refused with "The circles-of-trust migration is not applied: run its runbook first" and changed nothing.
  - With circles applied, `ch1-before.sh` read `send_resolves` true, `columns_found` 2, `realtime_policies` 0, `realtime_usage`, `may_send`, `may_insert_messages` and `may_add_policy` true, `send_is_definer` false (the stub's `realtime.send` is an invoker), and `series` 2.
  - `ch1-apply.sh` applied and wrote the seven snapshot files. Run again, it refused with "The chat core migration is already applied" and changed nothing.
  - `ch1-after-checks.sh` read one policy and the chat policy; the signal's owner `postgres`, a definer with `search_path=""` that may use `realtime` and call `realtime.send`, its failure a warning; `members_may_ask` true, `anon_may_ask` and `chat_member_granted` false; and `chats` 2 = `series` 2, `groups` 0, `messages` 0, `system_lines` 0.
    - After a tester said Going to the other's resbite, `system_lines` read 1 and `messages` 0.
    - With the policy put back without its own-topic condition, `the_chat_policy` read 0; restored, 1.
  - `ch1-listen-check.sh`, before any message, read all five false. After one tester wrote in their chat: `tester_found`, `other_found` and `their_chat` true, `another_chat` and `upper_case_topic` false. A second statement in the same session found no claims set.
  - After that message and the answer's line, the step 7 count read 2.
  - `ch1-throughput.sh`, on five sample answers (clean, clean with `deferred` 4, cut short by a later claim, 503, timed out), read `clean` 2, `cut_short` 1, `failed_or_timed_out` 2 and `deferred` 4.
  - `ch1-rollback.sh` left `realtime_policies` 0. Run again, it failed at its `lock table` and changed nothing.

**Chat groups (12 November 2026).** On `ch2-groups`, with the commits "Groups: the screens, leaving, and the record", its fix round and the final fix wave on base `333747d`, and the migration and rollback at the hashes above.

- Full mode passes, 55 PASS lines, `chat-groups.sql`, `leave-series-concurrency.sh` and `chat-groups-concurrency.sh` included. Six `messages_signal` WARNINGs are expected, as for chat core.

  ```
  bash scripts/test-database-docker.sh
  ```

- The hosted baseline passes with the four candidates named, in order, 27 PASS lines:

  ```
  bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261111120000_connections_follow_ups.sql supabase/migrations/20261111130000_circles_of_trust.sql supabase/migrations/20261111140000_chat_core.sql supabase/migrations/20261111150000_chat_groups.sql
  ```

  - Name all four. Bare, this mode fails by design until all four are live.
  - `.after.sql` asserts the backfill's cases (G-B7): a long-finished stopped group comes out closed, one stopped by Edit after its end stays open until 48 hours after it, one cancelled ahead of its date stays open 48 hours from the migration, a running one has no close time, and a one-off keeps chat core's close. Then the new objects: `stopped_at`, `series_leaves` with RLS on, no policy and no grant, the two calls for `authenticated` only, every private function a definer with an empty `search_path`, the two triggers, and the redefined functions' grants kept.
  - It then rehearses the rollback in a transaction it rolls back: each of the 12 restored bodies equals its source byte for byte with its grants, every addition is gone and `is_group` reads false everywhere. Inside the same transaction chat core's, circles' and follow-ups' rollbacks then run, each passing its guard (Task 2).
- The app check passes: the typecheck, 1,101 tests and the content validation (`(cd mobile && npm run check)`).
- Every edge test file passes, 107 tests in 11 files, unchanged by this plan.
- **The browser scripts**, against a fake project URL with every Supabase request stubbed, on Expo web started after the last edit: `verify-chat.mjs` 58 (the group scenarios gr1 to gr9 and gr4b to gr4d among them), `verify-event.mjs` 30, `review-ui.mjs` passed and `verify-planning.mjs` 16. Because the resbite page now reads `series_is_group`, the scripts that open it stub that call too; `verify-circle.mjs` 6, `verify-rsvp.mjs`, `verify-connections.mjs` 9, `verify-contact-invites.mjs` 6 and `verify-account.mjs` passed with them.
- **The fingerprint, on a local replay** (as for chat core). From chat core's 464 there are 479.
  - 15 objects are added: nine functions (`leave_series` and `series_is_group`, each public and private, and the private `attendees_clear_leave`, `chat_hide_line`, `chat_place_hidden`, `group_stopped` and `plans_group_flag`), the table `private.series_leaves` with its key, its foreign key and its index, and the triggers `plans_group_flag` and `attendees_clear_leave`.
  - 13 change by definition: `public.chats` (its `stopped_at`), and the private `attendees_chat_lines`, `plans_chat_lines`, `chat_member`, `chat_closes_at`, `chat_open`, `chat_summary`, `chat_row`, `my_chat_overview`, `notification_recipient_eligible`, `can_see_guests`, `request_connection` and `roll_repeating_plans`.
  - Nothing is removed and no grant changes. On the replay, which has no plans, `public.chats` has 0 rows.
  - The rollback, wrapped as below, gives back the 464 exactly, by `(kind, name)`, definition and grant. Run again, it fails at its `lock table` (`private.series_leaves` is gone) and changes nothing.

**Chat safety (12 November 2026).** On `ch3-safety` at `290c3b3`: plan 2's final work, plan 3's database (Tasks 1 to 3, rulings SR1 to SR8; its server-side final review clean at `ad0a3e6`) and plan 3's app (Tasks 4 to 6, rulings SR2, SR4, SR6, SR7 and SR9), integrated, with this record on top. The migration and rollback are at the hashes above.

- Full mode passes, 64 PASS lines, `chat-safety.sql` and `chat-safety-concurrency.sh` included. The races cover a report, a fold and the team's removal each meeting an account deletion, the rollback meeting a send, the 20-a-day limit under eight reports at once, one notice per moderator under six reporters at once, and one report sent five times at once. Six `messages_signal` WARNINGs are expected, as for chat core.

  ```
  bash scripts/test-database-docker.sh
  ```

- The hosted baseline passes with the five candidates named, in order, 29 PASS lines:

  ```
  bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261111120000_connections_follow_ups.sql supabase/migrations/20261111130000_circles_of_trust.sql supabase/migrations/20261111140000_chat_core.sql supabase/migrations/20261111150000_chat_groups.sql supabase/migrations/20261111160000_chat_safety.sql
  ```

  - Name all five. Bare, this mode fails by design until all five are live. In a scratch copy with the five lines appended to `migrations.txt`, as their runbooks' step 3 append them, the bare run passed, 24 PASS lines: what step 3 means by "from now on".
  - `.before.sql` asserts that nothing of plan 3 exists, and records the bodies it replaces with their grants. `.after.sql` asserts the six tables (RLS on, no policy, no privilege, empty), the five calls for `authenticated` only, the four helpers for no API role, every private function a definer with an empty `search_path`, the claim for `service_role` only, the kind check, and every replaced body changed with its grants kept.
  - It then rehearses the rollback in a transaction it rolls back, with a suspension, a block, a report, a moderator, an acceptance, a term and a `report_filed` notice with a delivery in place: each of the 13 restored bodies equals its source byte for byte with its grants, nothing of plan 3 is left, and plan 2's rollback, which refused before, then runs.
- The app check passes: the typecheck, 1,210 tests in 98 runs, and the content validation (`(cd mobile && npm run check)`).
- Every edge test file passes, 109 tests in 11 files (107 and the moderators' push's 2).
- **The browser scripts** passed during the build, on the task branches before integration, with every Supabase request stubbed: `verify-chat.mjs` 77 (s1 to s10 among them), `verify-event.mjs` 32, `verify-connections.mjs` 10, `verify-planning.mjs` 16, `verify-contact-invites.mjs` 6, `verify-circle.mjs` 6, `review-ui.mjs` and `verify-rsvp.mjs` (Task 5's last round, `eef8fc9`); `verify-deletion.mjs` 12, once without and once with `EXPO_PUBLIC_SUPPORT_ADDRESS` (Task 6's, `813daeb`). The app review runs them again on `ch3-safety`.
- **The fingerprint, on a local replay** (as for chat core). From plan 2's 479 there are 532: 53 added and 14 changed, as listed under step 3. Nothing is removed and no grant changes. The rollback, wrapped as below, gives back the 479 byte for byte, with a block, a report, a suspension, a moderator, acceptances, a term and a pending `report_filed` delivery in place; plan 2's rollback then gives back the 464. Run again, plan 3's fails at its `lock table` (`private.chat_rules_acceptances` is gone) and changes nothing.
- **Plan 3's scripts, rehearsed** exactly as printed here, through a stand-in for the CLI that sends each query to a local replay (the history table stood in), once with `bash` and once with `zsh`: the same output, errors, exit codes and files from both. Every read-only script left the database byte-identical (a `pg_dump` hashed before and after). No script's text, output, CLI call or file holds an account id, a phone number or an email, though the replay's three people had all three.
  - `ch3-before-checks.sh` read `en_US.utf8`, true, true and `0`, and no override. On a database made with the `C` locale it read `C`, false and false; with `log_parameter_max_length_on_error` set to -1 for the database, the first query read `-1`. Its second query (fix round 1) listed each override planted: `log_parameter_max_length_on_error` for `authenticated` in this database (`-1`) and in every database (`5`), and `log_parameter_max_length` for the database; another database's override was left out, and a secret-like setting on the same database was never printed. The catalog it reads is readable by a role that isn't a superuser, as the CLI's role on hosted isn't.
  - `ch3-apply.sh`: with the migration changed by one line, it stopped at the hash, with no CLI call. Before chat groups (the replay at 464) it refused with "The chat groups migration is not applied: run ch2-apply.sh first" and changed nothing. On the 479 it applied: history `24 | 20261111160000`, the fingerprint 532 (53 added, 14 changed), `hosted-after-safety.json` equal to it, and the six tables at 0 in `hosted-counts-after-safety.json`. Run again, it refused with "The chat safety migration is already applied". With a clashing `private.invited_by` planted, the apply failed, rolled back whole, and the history repair never ran.
  - `ch3-after-checks.sh` read every count 0; 6, 6, 0, 0; true, false, false, false, `2026-11`, 180 and true. Before the apply it failed (`private.blocks` does not exist). Each value moved when its fault was planted: a block, a term or a `report_filed` row (the counts), a policy, RLS off, `select` to `anon` or `insert` to `service_role` (the lock-down), `execute` on `block_user` to `anon`, `my_blocks` revoked from `authenticated`, a helper or the claim granted to `authenticated`, another rules version or keeping period, and the kind check without `report_filed`.
  - `ch3-gate.sh` read 0, 0 and 0 after the apply. After `moderators.sql` with one account's email and one unknown (`moderators` 1, `no_account` the unknown one) and `blocked-terms.sql` with two terms (`terms` 2; a list holding one bad term first changed nothing and printed `refused` 1, no term), it read 2, 1 and 1. With that moderator's grant revoked, `moderators_pushed` read 0.
  - `ch3-rollback.sh`: with the file changed, it stopped at the hash. With plan 3 applied, `ch2-rollback.sh` refused ("Run the chat safety rollback before the chat groups rollback") and `ch1-rollback.sh` refused ("Run the chat groups rollback before the chat core rollback"), each changing nothing. Then it ran: the 479 byte for byte, `hosted-after-rollback-safety.json` equal to it, the history row kept, the `report_filed` notice and its delivery gone, and the account `suspend-account.sql` had suspended still suspended, as chat safety's rollback step 3 warns. Run again, it failed at its `lock table`; `ch2-rollback.sh` then passed, to the 464.
  - Chat core's `ch1-throughput.sh`, with one `report_filed` notice waiting and one delivered as pending, read `waiting` 1, `chat_waiting` 0, `chat_pending` 0 and `other_pending` 1 (step 8's note).
  - The reports queue's read-only state query ran before and after the rollback on the suspended account: no live grant, and `may_use_the_app` false.

## Rollout runbook

**Before this runbook.** The follow-ups and circles migrations are live by their own runbooks: the history reads `21 | 20261111130000`. Chat core refuses to apply otherwise (step 2's guard). If their sender redeploys are still pending when this sitting comes, step 4 here carries their words too.

**Order.** The steps below, by their numbers:

0. The owner's answers to the owner questions (R-Q4's blocks the release).
1. Before snapshot, with the Realtime checks and chat safety's two settings.
2. The migrations, in one sitting: chat core, then chat groups, then chat safety.
3. After snapshot, the Realtime checks, advisors.
4. The `deliver-notifications` redeploy.
5. Realtime "Allow public access" off.

   5a. The moderators and the blocked terms, in the SQL editor, after step 4, and the release gate.

   5b. The support address in the EAS production environment, before the build.
6. The TestFlight build. Testers update before anyone chats. It goes to App Review only after step 6a.

   6a. App Review: the review account, the address in the installed build and on the listing, R-Q4's answer, then, once step 7's chat safety checks have passed, the submission with the review notes.
7. The device checks.
8. The throughput check during the first busy chat hour.

From the release on, the team reads the reports queue daily. That is a standing duty, under its own heading after step 8, not a step, so "steps 2 to 6" still means the rollout.

- **The migration goes before the sender** (step 4 after step 2).
  - The hosted `finish_notification_delivery` refuses the new outcome `deferred` until this migration is live (`supabase/migrations/20261030120000_push_delivery.sql`, restored by the rollback at `supabase/rollback/20261111140000_chat_core.rollback.sql:239-260`).
  - The new sender hands back every job it could not start before its budget ran out, as `deferred`. Against the old finish that hand-back fails. The job stays leased as `sending`, and the claim marks it `unknown` once the lease ends, so it is never sent.
- **The migration and the sender go before the build.** The chat build calls the ten functions and joins `chat:<series>`. The build reaches testers only once Realtime's public access is off (step 5).
- **The sender goes before the moderators** (step 5a after step 4). Until the redeploy, the old sender words a `report_filed` job as a generic `plan_update` push whose tap opens the reported resbite. With no moderator yet, no such job exists.
- **The team's lists and the address go before the build** (steps 5a and 5b before step 6). A chat build must meet a filled blocked-terms list and a moderator who is pushed. And `EXPO_PUBLIC_*` values are fixed when the bundle is built, so a build made before step 5b shows no contact line, whatever is set later.

**Owner-run scripts.** The assistant's safety check refuses live reads and the apply, so the owner runs short scripts with `! bash ~/<name>.sh`.
- At rollout time the assistant writes each script into the home directory from the block in its step. The owner reads it, then runs it.
- Each runs from the checkout the rollout uses: `REPO`, by default `~/dev/resbite-app`, at the merged commit.
- None prints a secret, a phone number or an account id.
- **The SQL editor's scripts** (plan 3's seven, in `supabase/ops/`) are not run through the CLI. The owner, or a moderator, pastes each into the hosted project's SQL editor, edits its one literal there (an email, a term or a report id), and runs it. That literal, and what the scripts show (a report's words, names, an account id kept for an undo), stay in the SQL editor: never in this file, the repository or a chat.

**The assistant's steps.** The advisors read (through the Supabase MCP server) and the `deliver-notifications` deploy are the assistant's. It does each once the owner approves it, as the connections record did.

0. **The owner questions, before step 2.** Record each answer under "Applied". With no answer, the defaults ship.
   - **K-S17, Delete and Remove on a closed chat.** By default an author deletes their own message, and hosts remove anyone's, after the chat closes (plan Decision 7; `delete_message` and `remove_message` check no close, `supabase/migrations/20261111140000_chat_core.sql:573-601`). The reasoning: "reading only" means no new messages, and moderation and a person's own words should not expire with the chat.
     - **Built that way by default.** The alternative, refusing both after the close, is one check in each function, and a new migration hash.
   - **The sender's budget and the schedule's timeout** (an offer, as one change).
     - The schedule calls the sender with a 10-second pg_net timeout (`timeout_milliseconds := 10000`, `supabase/ops/schedule-deliver-notifications.sql:44`).
     - The claim loop starts nothing new once 5 seconds have passed (`budgetMs = 5_000`, `supabase/functions/_shared/notification-engine.ts:138`).
     - Each provider or journal call may take up to 10 seconds (`AbortSignal.timeout(10000)`, `supabase/functions/_shared/notification-adapters.ts:23` and `:78`). A job started just before 5 seconds makes up to three such calls in turn: validate, then the send or the receipt check, then finish (`supabase/functions/_shared/notification-engine.ts:183`, `:191` or `:199`, and `:217`). So one started job can keep the run going up to 30 seconds past the budget, about 35 in all, and each `deferred` hand-back after the budget is one more call of up to 10 seconds (`:165`). Past the caller's 10 seconds the call is recorded as timed out. A send cut off mid-way stays leased as `sending`, and the claim marks it `unknown` after the two-minute lease, never sent again (`supabase/migrations/20261111140000_chat_core.sql:725-727`).
     - The offer: raise the schedule's timeout (re-run the ops file with a larger `timeout_milliseconds`) and the loop's budget (a sender change and a redeploy) together, so the budget plus a started job's three calls stays under the timeout.
     - **Default: unchanged** (10 seconds and 5). Step 8's `deferred` and `failed_or_timed_out` counts show whether it matters. Neither file is changed by this runbook.
   - **The words on the lock screen (CH-P7).** A chat push shows the message's words ("Leo: I can bring the snacks"). The alternative is "Leo sent a message".
     - **Built that way by default**, as the roadmap's owner table says. The alternative is a sender change and a redeploy.
   - **Chat groups' questions** (plan 2). Each has the default the build ships. The build doesn't wait for the answers: a different answer is a change to plan 2, its migration and its hash, before step 2.
     - **G-QA, the place in a group's chat lines (I11, Decision 11).** "Next one: Thu 20 Nov · Ana's flat" and the place-change line are read by members who haven't answered, people a guest brought among them. Their resbite page shows them only the area. **Default: the place is hidden from them, server-side** (`private.chat_place_hidden`, `private.chat_row`). The alternative, the place for every member (the spec's wording), is one condition in `private.chat_row`.
     - **G-QB, resuming a stopped group (I8, Decision 12).** After "Doesn't repeat" and then "Every week" again, the chat would still say "Ana stopped repeating this · the last one is Thu 27 Nov". **Default: that line is removed, with no new words.** The alternative, a new line such as "Ana set this to repeat again", needs approved wording.
     - **G-QC, the circles runbook's CO-Q1 (I9, Decision 13), still open there.** Is a brought person who said Can't go carried to the next occurrence? **Default: carried, as built**, the only answer that fits "everyone in a group is in its chat whatever their reply". If the owner chooses the alternative, the circles roll changes before the circles migration, and plan 2's copy of it is re-based on the new circles body and hash before step 2.
     - **G-QD, "this Thursday" on a fortnightly group (ruling GR6 M9).** The audience row, an announcement card's heading and the cancelled line say "this Thursday" for the current occurrence, which on a group that repeats every 2 weeks can be up to 13 days ahead. That is the spec's wording, written with a weekly example. **Default: unchanged, "this Thursday" on every group.** The alternative, the date ("Going on Thu 27 Nov"), is new wording in the app only.
     - Not owner questions: P2-Q1 to P2-Q4 are ruled (plan 2's Decisions 7 to 10). Their limits are under Known gaps.
   - **Chat safety's questions** (plan 3). Each says when it is needed and the default the build ships. The build doesn't wait for the answers, but the release does where a line says so: the support address, the blocked terms and R-Q4. A different answer to a question needed before step 2 is a change to plan 3's migration and its hash.
     - **The support address** (`EXPO_PUBLIC_SUPPORT_ADDRESS`; CH-P13, G-N10). It shows on Data & privacy's Contact topic and under a report's thanks, and goes in the review notes and on the App Store listing. **Needed before step 5b. Default: none, and the release waits.** While it is unset, or not an address, the app shows no contact line and step 6a's submission is blocked.
     - **Who moderates** (G-B4(c), Decision 10). The moderators get "A new report is waiting." for each report and read the queue. **Needed before step 5a. Default: the owner alone,** one email in `moderators.sql`. A moderator other than the owner can read and act on reports only in the hosted project's SQL editor, with the queue's scripts: there is no screen for it (challenge N8). So each moderator needs access to the hosted project's dashboard, which only the owner can give, and an account on Resbite for the push.
     - **The blocked terms** (G-B4(a), Decision 9). **Needed before step 5a. Default: none seeded, and the release waits for a list.** Step 5a's gate fails while `private.blocked_terms` is empty. The list is the owner's, pasted only into the SQL editor's copy of `blocked-terms.sql`. Only messages and announcements are checked; titles, notes to guests and names are not (challenge N4).
     - **The chat rules' wording and the Terms document** (G-B4(d), Decision 8). **Default: the rulings' wording,** "Be kind. No harassment, hate, threats or spam. Messages that break these rules are removed, and people who break them can lose their account." with I agree, version `2026-11`; **the Terms document and `TERMS_VERSION` unchanged.** Needed before step 6 for the wording, which is in the build, and before step 6a for the Terms. A new version for everyone to agree to again is `private.chat_rules_version()`, before step 2.
     - **G-S13, invitations from a blocked person** (Decision 11). **Default, built: no.** A blocked person's `invited` notice to the blocker is not eligible, and the blocker's number reads to them as one not on Resbite. The inviter is never told. What the default still lets through is under Known gaps. Needed before step 2.
     - **R-Q1, Report from an invitation** (Decision 14). Report the person is offered wherever Block is on an invitation: the card on My resbites and the resbite page, for the announcer, the person who invited them and the owner. It reports a person, not "this resbite", so the spec's non-goal (CH-P13) stands. **Default: yes.** Needed before step 2.
     - **R-Q2, a block reaching the team** (Decision 15, challenge I10). **Default: yes, as I10:** listed in the queue's daily read (`open-reports.sql`, the last 7 days: who blocked whom and when, never a message), with no push. Needed before step 6, since Data & privacy says so (R-Q7).
     - **R-Q3, how long a closed report is kept** (Decision 7). **Default: 180 days after it is closed,** then `purge-closed-reports.sql` deletes it, when the daily read shows a `due` row. Another period is `private.report_keep_days()` before step 2 (a new migration hash) and the number in Data & privacy's `reportsPrivacy` line (a new build).
     - **R-Q4, who answers within 24 hours when the owner is away. Release-blocking.** The review notes promise that the team checks the queue daily and acts within 24 hours. The owner names a backup reader before the release: someone on `moderators.sql`'s list, with the SQL editor (above). "Applied" records that one is named, never who: no name, number or account id in this file. **Until then the owner alone reads the queue daily. Needed before step 6a's submission, which waits for it.**
     - **R-Q5, a blocked person's join requests** (Decision 18). **Default: no push of any kind from a blocked person to the blocker, join requests included.** The request still shows in the requests list to every host, the blocker included, who can decline it. The resbite's own changes still arrive. Needed before step 2.
     - **R-Q6, what a host's block does** (ruling SR1). A block hides the person's messages from the blocker only, hosts included (CH-P13); to stop them for everyone, a host removes the person from the resbite. **Default: so, and a host's Block confirm says** "This hides their messages from you only. To stop them for everyone, remove them from the resbite." Needed before step 6 (the line is in the build); a different rule is a migration change, before step 2.
     - **R-Q7, what Data & privacy says of blocks** (ruling SR4). **Default:** "Blocks stay until you undo them. The Resbite team can see who blocked whom." Needed before step 6.
     - Plan 2's owner questions are in its part of this step, above.
   - **Not this runbook's:** the circles runbook's CO-Q1 (here as G-QC) and CO-Q2 (whether its rollback keeps the bringers' unanswered links live) are answered in that runbook, before its migration.
1. **Before snapshot, the history, the Realtime checks and the series count.** Read-only, into this directory, with `! bash ~/ch1-before.sh`:

   ```bash
   #!/bin/bash
   # Read-only: the before snapshot, the history, the Realtime checks, the series count and the jobs (chat core, step 1).
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/chat-release
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-before.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-before.json"
   supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > "$D/hosted-storage-policies-before.json"
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked "select pg_catalog.to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null as send_resolves, (select count(*) from information_schema.columns where table_schema = 'realtime' and table_name = 'messages' and column_name in ('extension', 'topic')) as columns_found, (select count(*) from pg_catalog.pg_policies where schemaname = 'realtime') as realtime_policies"
   supabase db query --linked "select current_user as applying_role, has_schema_privilege(current_user, 'realtime', 'usage') as realtime_usage, has_function_privilege(current_user, 'realtime.send(jsonb,text,text,boolean)', 'execute') as may_send, (select p.prosecdef from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('realtime.send(jsonb,text,text,boolean)')) as send_is_definer, has_table_privilege(current_user, 'realtime.messages', 'insert') as may_insert_messages, pg_catalog.pg_get_userbyid(c.relowner) as messages_owner, pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE') as may_add_policy from pg_catalog.pg_class c where c.oid = 'realtime.messages'::regclass"
   supabase db query --linked "select count(distinct series_id) as series from public.plans"
   supabase db query --linked "select jobname from cron.job where jobname in ('deliver-notifications', 'roll-repeating-plans') order by jobname"
   ```

   - **The history line** should read `21 | 20261111130000`: follow-ups and circles are live. With `19` or `20`, finish the circles runbook first. Anything else: stop.
   - **The fingerprint.** Compare `hosted-before.json` with a local replay of `migrations.txt` plus the follow-ups and circles files, by `(kind, name)`.
     - Expect 387 of 387 by definition, as in the circles `hosted-after.json`.
     - The only differences should be the 15 known `acl` ones: hosted's default `service_role` grant on 14 older `public` objects, and `public.unregister_device(text)`.
     - **Confirm from the real snapshot before approving.** Stop if anything else differs. A full match also means the chat rollback will meet the bodies it was rehearsed on.
   - The storage policies should match the replay, 7 of 7.
   - **Realtime as the migration needs it (K-S5).** Stop on any other answer.
     - `send_resolves` true, `columns_found` 2 and `realtime_policies` 0.
     - `realtime_usage` and `may_send` true for the role the CLI applies with. That role owns `private.messages_signal`, the definer that calls `realtime.send`.
       - Without them nothing fails: every broadcast becomes a WARNING and the write commits (lines 1103-1107). But no phone hears a signal, and every open chat waits for its 20-second poll.
     - `send_is_definer` says whether hosted's `realtime.send` runs as its owner. If it is false, it inserts into `realtime.messages` as its caller, the signal's owner (the applying role), so `may_insert_messages` must be true.
       - Without that grant nothing fails and no `messages_signal` WARNING shows (hosted's own `realtime.send` may raise a warning of its own). The write commits and the broadcasts just never happen, and step 7's count would read 0 after the build. Stop here instead.
     - `may_add_policy` true: that role may act as `realtime.messages`' owner, which `create policy` needs. Without it the apply fails at the policy and rolls back whole.
     - If `to_regprocedure` reads false, the `may_send` query fails instead, and the script stops there.
   - **The series count** is what step 3's `public.chats` row count should be (the backfill), plus any resbite made in between.
   - **The jobs.** `deliver-notifications` should be listed. `roll-repeating-plans` is listed if the follow-ups runbook created it.
     - Plan 2's roll, applied in the same sitting, sets the roll flag, so it writes no `admin` or `joined` line for anyone it carries; it writes "ended" and "Next one" itself. (Chat core alone would write an `admin` line for each carried admin, Decision 4: one reason it waits for plan 2.)
   - If the CLI's role is refused the `realtime` or `private` reads, paste the queries into the SQL editor. They are read-only there too.
   - **Nothing of chat safety exists yet.** Its `.before.sql` asserts the same locally: none of its six tables or nine functions, and chat core's thirteen kinds in the outbox's check. Step 2's `ch3-apply.sh` refuses otherwise.
   - **Chat safety's two settings** (plan 3; the final review's M3 and its note on the log). Read-only, with `! bash ~/ch3-before-checks.sh`:

     ```bash
     #!/bin/bash
     # Read-only: the hosted settings chat safety relies on (chat plan 3, step 1): the database's locale, which the blocked
     # terms' check and their whole-word match use, and whether a failed statement's values reach the log, for this
     # session and for any role or database that overrides it. It prints a locale's name, two booleans, a number and the
     # log-parameter overrides (a role's or a database's name and the setting), nothing else: no other setting is read.
     set -euo pipefail
     cd "${REPO:-$HOME/dev/resbite-app}"
     supabase db query --linked "select (select d.datctype from pg_catalog.pg_database d where d.datname = current_database()) as ctype, ('CABR' || chr(211) || 'N aqu' || chr(237)) ~* ('\mcabr' || chr(243) || 'n\M') as accented_whole_word, (chr(241) || 'and' || chr(250)) ~ '^\w(.*\w)?\$' as accented_term_fits, current_setting('log_parameter_max_length_on_error') as error_values_logged"
     supabase db query --linked "select coalesce(r.rolname, '(every role)') as role, coalesce(d.datname, '(every database)') as database, c.setting from pg_catalog.pg_db_role_setting s left join pg_catalog.pg_roles r on r.oid = s.setrole left join pg_catalog.pg_database d on d.oid = s.setdatabase cross join lateral unnest(s.setconfig) as c(setting) where (s.setdatabase = 0 or d.datname = current_database()) and starts_with(c.setting, 'log_parameter_max_length') order by 1, 2, 3"
     ```

     - `ctype` is the database's own locale for letters (`pg_database.datctype`: from Postgres 16 there is no `lc_ctype` setting to `show`). **Expected: a UTF-8 locale,** such as `C.UTF-8` or `en_US.UTF-8`, never `C` or `POSIX`.
     - **`accented_whole_word` and `accented_term_fits` true.** They ask what the blocked terms rely on, with the characters written by number so the script is plain ASCII: "CABRÓN aquí" holds "cabrón" as a whole word in any case (the `\m…\M` match with `~*`, `supabase/migrations/20261111160000_chat_safety.sql:1000` and `:1058`), and "ñandú" passes the terms' check (a word character first and last, `:829`). Under `C` both are false.
     - **Either false: stop before step 2.** Whole-word matching would then miss an accented word written in capitals, and a term that starts or ends with an accented letter would fail the table's check, which stops the whole `blocked-terms.sql` run. The fix is an explicit collation on those three patterns in plan 3's migration: a new hash, rehearsed again, before the sitting.
     - **`error_values_logged` `0`** (Postgres's default). Postgres then logs a failed statement without its bound values, so a refused report's details or a refused message's words never reach the log. Anything else: stop before step 2 and decide. Setting it back to 0 is a change to the hosted project's database settings, outside this runbook.
     - **The second query: no row, or only rows reading `log_parameter_max_length_on_error=0`** (review M6). The first query reads the CLI role's own session; the app's calls run as other roles (`authenticator`, then `authenticated`), and a value set for a role or a database (`alter role … set`, which Supabase uses for `statement_timeout`) applies to them instead. It lists only the overrides that apply to this database, and only of `log_parameter_max_length_on_error` and `log_parameter_max_length`, never another setting, since a database's settings can hold a secret. A `log_parameter_max_length_on_error` row other than `=0`: stop before step 2 and decide, as above. A `log_parameter_max_length` row matters only where statements are logged; record it under "Applied".
2. **Migration** (the owner approves the file by name and sha256, above, in the release sitting with plans 2 and 3). Never `supabase db push`: it would also push the local-only migrations. Run `! bash ~/ch1-apply.sh`. It checks the hash, applies in one transaction, records, and takes step 3's snapshots:

   ```bash
   #!/bin/bash
   # The chat core migration (steps 2 and 3). Only after the owner approves the file by name and sha256, in the release
   # sitting with chat plans 2 and 3: chat core is not meant to go live on its own.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/chat-release
   F=supabase/migrations/20261111140000_chat_core.sql
   echo "1047fb379a4e8a942b49db3f7134674caecf2cbb30f67e0ebf9f0f2fea6a78ce  $F" | sha256sum -c -
   GUARD="if pg_catalog.to_regclass('private.plan_removals') is null or pg_catalog.to_regprocedure('private.first_name(text)') is null then raise exception 'The circles-of-trust migration is not applied: run its runbook first'; end if;
    if pg_catalog.to_regclass('public.messages') is not null then raise exception 'The chat core migration is already applied'; end if;"
   mkdir -p /tmp/ch1
   { echo 'begin;'; echo "do \$\$ begin $GUARD end \$\$;"; cat "$F"; echo; echo 'commit;'; } > /tmp/ch1/apply.sql
   supabase db query --linked -f /tmp/ch1/apply.sql
   supabase migration repair --status applied 20261111140000 --linked --yes
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after.json"
   supabase db query --linked -o json "select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by policyname" > "$D/hosted-storage-policies-after.json"
   supabase db query --linked -o json "select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'realtime' order by policyname" > "$D/hosted-realtime-policies-after.json"
   ```

   - The script stops before applying if the hash differs.
   - Everything runs in one transaction, the guard first. Before circles, or a second run, the guard refuses and changes nothing. Any other error rolls all of it back too, and the script stops before the history repair.
   - If the apply succeeded and only the repair failed, run the repair alone, from the repository root. Then run the script's last five lines, for the history and step 3's snapshots.

     ```
     supabase migration repair --status applied 20261111140000 --linked --yes
     ```

   - The history query should then read `22 | 20261111140000`. Plan 2 follows at once, then plan 3, below, in the same sitting.
   - **Locks, all brief.**
     - `private.notification_outbox`: the new column and its foreign key, the kind check re-added (it reads every row once) and two indexes.
     - `public.plans`, `public.attendees` and `public.plan_admins`: the new triggers.
     - `realtime.messages`: the new policy.
     - The schedule's run in that minute may wait for the commit. That is harmless.
   - **Installed builds keep working.** They call nothing this migration made or changed, and they read the same plans and guests.
     - A chat notice can only exist once someone writes in a chat, which needs the new build.
     - Until step 4, the old sender would word such a job with the generic text and a `plan_update` tap.
   - **Then chat groups** (the owner approves `20261111150000_chat_groups.sql` by name and sha256, above). Run `! bash ~/ch2-apply.sh`, in the same shape. Never `supabase db push`.

     ```bash
     #!/bin/bash
     # The chat groups migration (chat plan 2; steps 2 and 3). Only after the owner approves the file by name and sha256,
     # right after ch1-apply.sh, in the release sitting with chat plan 3.
     set -euo pipefail
     cd "${REPO:-$HOME/dev/resbite-app}"
     D=qa/chat-release
     F=supabase/migrations/20261111150000_chat_groups.sql
     echo "068d7f42432862749646b4f7972e6cc9bc226d2670ca82d96610fd3b66759f23  $F" | sha256sum -c -
     GUARD="if pg_catalog.to_regclass('public.messages') is null then raise exception 'The chat core migration is not applied: run ch1-apply.sh first'; end if;
      if pg_catalog.to_regclass('private.series_leaves') is not null then raise exception 'The chat groups migration is already applied'; end if;"
     mkdir -p /tmp/ch2
     { echo 'begin;'; echo "do \$\$ begin $GUARD end \$\$;"; cat "$F"; echo; echo 'commit;'; } > /tmp/ch2/apply.sql
     supabase db query --linked -f /tmp/ch2/apply.sql
     supabase migration repair --status applied 20261111150000 --linked --yes
     supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
     supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-groups.json"
     supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after-groups.json"
     ```

     - The script stops before applying if the hash differs.
     - One transaction, the guard first. Before chat core, or a second run, the guard refuses and changes nothing. Any other error rolls all of it back, and the script stops before the history repair.
     - If the apply succeeded and only the repair failed, run the repair alone, from the repository root, then the script's last three lines:

       ```
       supabase migration repair --status applied 20261111150000 --linked --yes
       ```

     - The history query should then read `23 | 20261111150000`.
     - **Locks, all brief.** `public.chats` gains `stopped_at`, and the backfill updates the repeating series' rows; `public.plans` and `public.attendees` gain a trigger each. The schedule's run in that minute may wait for the commit.
     - **Installed builds keep working.** No build in testers' hands has chat. The chat build's resbite page reads `series_is_group`, which exists from now on.
   - **Then chat safety** (the owner approves `20261111160000_chat_safety.sql` by name and sha256, above). Run `! bash ~/ch3-apply.sh`, in the same shape. Never `supabase db push`.

     ```bash
     #!/bin/bash
     # The chat safety migration (chat plan 3; steps 2 and 3). Only after the owner approves the file by name and sha256,
     # right after ch2-apply.sh, in the release sitting with chat plans 1 and 2.
     set -euo pipefail
     cd "${REPO:-$HOME/dev/resbite-app}"
     D=qa/chat-release
     F=supabase/migrations/20261111160000_chat_safety.sql
     echo "f8cfb5a62783528636aae2b8c461f150f8ae8f0553219d42b4b991bf66f2a2b2  $F" | sha256sum -c -
     GUARD="if pg_catalog.to_regclass('private.series_leaves') is null then raise exception 'The chat groups migration is not applied: run ch2-apply.sh first'; end if;
      if pg_catalog.to_regclass('private.blocks') is not null then raise exception 'The chat safety migration is already applied'; end if;"
     mkdir -p /tmp/ch3
     { echo 'begin;'; echo "do \$\$ begin $GUARD end \$\$;"; cat "$F"; echo; echo 'commit;'; } > /tmp/ch3/apply.sql
     supabase db query --linked -f /tmp/ch3/apply.sql
     supabase migration repair --status applied 20261111160000 --linked --yes
     supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
     supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-safety.json"
     supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-after-safety.json"
     ```

     - The script stops before applying if the hash differs.
     - One transaction, the guard first. Before chat groups (no `private.series_leaves`), or a second run (`private.blocks` exists), the guard refuses and changes nothing. Any other error rolls all of it back, and the script stops before the history repair.
     - If the apply succeeded and only the repair failed, run the repair alone, from the repository root, then the script's last three lines:

       ```
       supabase migration repair --status applied 20261111160000 --linked --yes
       ```

     - The history query should then read `24 | 20261111160000`.
     - **Never `supabase db push`,** and any rollback goes in reverse order only: plan 3's, then plan 2's, then plan 1's (G-N11; Rollback, below).
     - **Locks, all brief.** `private.notification_outbox`: its kind check, dropped and added again with `report_filed` (it reads every row once). `public.profiles`, `public.messages` and `auth.users`: the new tables' foreign keys. Replacing the thirteen bodies locks no table. The schedule's run in that minute may wait for the commit.
     - **Installed builds keep working.** The bodies they call (`plan_connection_states`, `request_connection`, `invite_contacts`, `contacts_on_resbite`, the claim) answer as before while no block exists, and only the chat build can make one. No build in testers' hands sends a message, so none meets the chat rules or the blocked terms.
3. **After snapshot, the Realtime checks and advisors.**
   - `hosted-after.json` should match a local replay of `migrations.txt` plus the three files: 464 of 464 by definition, with the same 15 `acl` differences.
   - **Before to after**, by `(kind, name)`, as listed under the checks above: 77 added and 6 changed. Nothing is removed and no grant changes. `.after.sql` asserts the same shape locally.
   - **Counts.** Four tables more:
     - `chat_reads` and `chat_mutes` with 0 rows;
     - `messages` with 0 rows, or a few system lines if anyone answered, changed or cancelled a resbite, or made an admin, since the commit: each writes one by trigger. No installed build can write a message. The after-checks below tell the two apart (`messages` and `system_lines`);
     - `chats` with step 1's series count, plus any resbite made in between.
     - Every other table keeps its row count. The storage policies are unchanged, 7 of 7.
   - **Realtime after the migration (K-S5).** Read-only, with `! bash ~/ch1-after-checks.sh`:

     ```bash
     #!/bin/bash
     # Read-only: the Realtime policy, the signal's definer and the chat rows after the migration (chat core, step 3).
     set -euo pipefail
     cd "${REPO:-$HOME/dev/resbite-app}"
     supabase db query --linked "select count(*) as realtime_policies, count(*) filter (where policyname = 'chat_members_listen' and cmd = 'SELECT' and roles = '{authenticated}'::name[] and qual like '%can_listen%' and regexp_replace(qual, '\s+', ' ', 'g') like '%(topic = ( SELECT realtime.topic() AS topic))%' and with_check is null) as the_chat_policy from pg_catalog.pg_policies where schemaname = 'realtime'"
     supabase db query --linked "select pg_catalog.pg_get_userbyid(p.proowner) as signal_owner, p.prosecdef as definer, p.proconfig as settings, has_schema_privilege(p.proowner, 'realtime', 'usage') as owner_realtime_usage, has_function_privilege(p.proowner, 'realtime.send(jsonb,text,text,boolean)', 'execute') as owner_may_send, p.prosrc like '%exception when others then%raise warning%' as failure_is_a_warning from pg_catalog.pg_proc p where p.oid = 'private.messages_signal()'::regprocedure"
     supabase db query --linked "select has_function_privilege('authenticated', 'private.can_listen(text)', 'execute') as members_may_ask, has_function_privilege('anon', 'private.can_listen(text)', 'execute') as anon_may_ask, has_function_privilege('authenticated', 'private.chat_member(uuid,uuid)', 'execute') as chat_member_granted"
     supabase db query --linked "select (select count(*) from public.chats) as chats, (select count(distinct series_id) from public.plans) as series, (select count(*) from public.chats where is_group) as groups, (select count(*) from public.messages where kind <> 'system') as messages, (select count(*) from public.messages where kind = 'system') as system_lines"
     ```

     - **Exactly one policy on `realtime.messages`:** `realtime_policies` 1 and `the_chat_policy` 1. `the_chat_policy` checks the own-topic condition itself (`topic = (SELECT realtime.topic())`, H34), so a policy without it reads 0. `hosted-realtime-policies-after.json` holds its text. It should read as lines 1130-1132: a broadcast, on the topic being joined, that `private.can_listen` allows.
     - **The signal's definer:**
       - `signal_owner` is step 1's `applying_role`, `definer` true, and `settings` holds `search_path=""`;
       - `owner_realtime_usage` and `owner_may_send` are true;
       - `failure_is_a_warning` is true: the call is wrapped, so a failure raises a WARNING and never fails the write.
     - `members_may_ask` true, `anon_may_ask` false and `chat_member_granted` false (K-N13).
     - `chats` equals `series` (plus any made in between). `groups` reads 0 after chat core alone (plan 1 sets none); run after `ch2-apply.sh`, it equals `ch2-after-checks.sh`'s `repeating_series` (below).
     - `messages` 0. `system_lines` 0, or one for each answer, change, cancellation or appointment made on hosted since the commit.
     - A real `realtime.messages` row needs a real message, so it is checked in step 7.
   - **Advisors.** Once the owner approves, the assistant reads them (security and performance) through the Supabase MCP server, into `hosted-advisors-after.json`.
     - Compare with the newest earlier `hosted-advisors-after.json` in the chain: circles' (`qa/circles-of-trust-2026-11-10/`) if it was taken, else follow-ups' (`qa/connections-follow-ups-2026-11-11/`), else connections' (`qa/connections-2026-11-10/`: 42 findings, 10 WARN, the rest INFO, no ERROR).
     - **Expected: no new WARN and no ERROR.** The ten public calls are invokers. Their private bodies and every other new function are definers in `private`, with an empty `search_path`. So neither `*_security_definer_function_executable` lint gains a line.
     - **New INFO lines are expected, of kinds the file already has.**
       - `rls_enabled_no_policy` for the four new public tables, `messages`, `chats`, `chat_reads` and `chat_mutes`: RLS on and no policy (Decision 2). No API role may read or write them.
       - `unindexed_foreign_keys` for `messages_plan_id_fkey`, `chat_reads_user_id_fkey` and `chat_mutes_user_id_fkey`. No index leads with those columns (lines 46-50, 100-113); they serve only cascades and the deletion step.
       - `unused_index` for the plain new indexes until they are used: `messages_series_idx`, `messages_series_updated_idx`, `messages_series_announcements_idx`, `messages_author_created_idx`, `notification_outbox_recipient_kind_idx` and `notification_outbox_message_idx`.
     - Unused-index notices can also come and go with use alone. Stop the rollout for anything else new.
   - Append this line to `supabase/tests/hosted-baseline/migrations.txt`:

     ```
     20261111140000_chat_core.sql                           20261111140000
     ```

   - **Chat groups, after `ch2-apply.sh`.**
     - `hosted-after-groups.json` should match a local replay of `migrations.txt` plus the four files: 479 of 479 by definition, with the same 15 `acl` differences. From `hosted-after.json` (chat core's 464), 15 added and 13 changed, as listed under the checks above. The 15 added are the nine functions, `series_leaves` with its key, its foreign key and its index, and the two triggers. The 13 changed are `public.chats`, by its new `stopped_at`, and twelve redefined bodies. Nothing is removed and no grant changes.
     - **Counts.** One table more, `series_leaves`, with 0 rows. `chats` keeps its row count. Every other table keeps its count.
     - Read-only, with `! bash ~/ch2-after-checks.sh`:

       ```bash
       #!/bin/bash
       # Read-only: the group flag's backfill, the stop times and the leave record after the chat groups migration
       # (chat plan 2, step 3). Counts only: no id, number or name.
       set -euo pipefail
       cd "${REPO:-$HOME/dev/resbite-app}"
       supabase db query --linked "select (select count(*) from public.chats where is_group) as groups, (select count(distinct series_id) from public.plans where repeat_weeks is not null or repeats_from is not null) as repeating_series, (select count(*) from private.series_leaves) as leaves"
       supabase db query --linked "select count(*) filter (where stopped_at is null) as running, count(*) filter (where stopped_at is not null and private.chat_open(series_id)) as stopped_open, count(*) filter (where stopped_at is not null and not private.chat_open(series_id)) as stopped_closed, max(stopped_at) filter (where stopped_at is not null and private.chat_open(series_id)) as latest_open_stop, max(stopped_at) filter (where stopped_at is not null and not private.chat_open(series_id)) as latest_closed_stop from public.chats where is_group"
       supabase db query --linked "select has_function_privilege('authenticated', 'public.leave_series(uuid)', 'execute') as members_may_leave, has_function_privilege('anon', 'public.leave_series(uuid)', 'execute') as anon_may_leave, has_function_privilege('authenticated', 'private.leave_series(uuid)', 'execute') as private_granted, has_function_privilege('authenticated', 'public.series_is_group(uuid)', 'execute') as members_may_ask, has_function_privilege('authenticated', 'private.group_stopped(uuid)', 'execute') as helper_granted"
       ```

       - `groups` equals `repeating_series`: the series with any occurrence whose `repeat_weeks` or `repeats_from` is set. `leaves` 0.
       - **The backfill's cases (G-B7).** `stopped_closed` counts the long-finished stopped groups, closed; `stopped_open` the recently stopped ones, open until 48 hours after their last end (a cancelled one's, 48 hours after its stop). So `latest_closed_stop` is more than 48 hours ago, and `latest_open_stop` within the last 48 hours. `running` are the groups still repeating, with no close time.
       - `members_may_leave`, `members_may_ask` and `private_granted` true: the public call is an invoker over the private body, which is granted to `authenticated`, chat core's pattern (`supabase/migrations/20261111150000_chat_groups.sql:564`). `anon_may_leave` false, and `helper_granted` false: `private.group_stopped`, a helper only the database calls, is revoked from every API role (`:77`).
     - **Advisors.** `rls_enabled_no_policy` gains an INFO line for `private.series_leaves`: RLS on and no policy, so no API role may read or write it, as for the other private tables the advisors already list (re-review N1). This plan adds no public table. Its two public calls are invokers and every new private function is a definer with an empty `search_path`, so neither `*_security_definer_function_executable` lint gains a line. `unindexed_foreign_keys` gains an INFO line for `series_leaves_user_id_fkey`: no index leads with `user_id`, and the key serves only the cascade from `public.profiles`, as chat core's three do. No `unused_index` line is expected (that lint skips primary keys). Stop for anything else new.
     - Append this line to `supabase/tests/hosted-baseline/migrations.txt`:

       ```
       20261111150000_chat_groups.sql                         20261111150000
       ```

   - **Chat safety, after `ch3-apply.sh`.**
     - `hosted-after-safety.json` should match a local replay of `migrations.txt` plus the five files: 532 of 532 by definition, with the same 15 `acl` differences. From `hosted-after-groups.json` (479), 53 added and 14 changed. Nothing is removed and no grant changes.
       - The 53 added: 14 functions (the five calls, each public and private, and the four helpers); the six tables; 21 constraints (six primary keys, eight foreign keys, the reports' five checks, `blocked_terms`' check and `blocks`' check that nobody blocks themselves); and 12 indexes (the six primary keys' and six more: `blocks_blocked_id_idx`, `reports_reporter_message_key`, `reports_open_user_key`, `reports_reporter_created_idx`, `reports_message_idx` and `suspensions_report_idx`).
       - The 14 changed: the outbox's `notification_outbox_kind_check`, and thirteen bodies: `chat_messages`, `chat_messages_since`, `chat_summary`, `my_chat_overview`, `send_message`, `send_announcement`, `notification_recipient_eligible`, `request_connection`, `plan_connection_states`, `invite_contacts`, `contacts_on_resbite` and `fold_web_account` in `private`, and the worker's `claim_notification_deliveries`. The fourteenth body the migration replaces, the deletion request, doesn't exist on hosted.
     - **Counts.** Six tables more, each with 0 rows: `blocks`, `reports`, `suspensions`, `moderators`, `chat_rules_acceptances` and `blocked_terms`. Every other table keeps its count; the migration writes no row.
     - Read-only, with `! bash ~/ch3-after-checks.sh`:

       ```bash
       #!/bin/bash
       # Read-only: the six chat safety tables, their lock-down, the calls' grants and the outbox's new kind after the chat
       # safety migration (chat plan 3, step 3). Counts, booleans and two settings only: no id, number, email or term.
       set -euo pipefail
       cd "${REPO:-$HOME/dev/resbite-app}"
       supabase db query --linked "select (select count(*) from private.blocks) as blocks, (select count(*) from private.reports) as reports, (select count(*) from private.suspensions) as suspensions, (select count(*) from private.moderators) as moderators, (select count(*) from private.blocked_terms) as blocked_terms, (select count(*) from private.chat_rules_acceptances) as acceptances, (select count(*) from private.notification_outbox where kind = 'report_filed') as report_notices"
       supabase db query --linked "select count(*) as tables, count(*) filter (where c.relrowsecurity) as rls_on, count(*) filter (where exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid)) as with_policy, count(*) filter (where has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger') or has_table_privilege('authenticated', c.oid, 'select, insert, update, delete, truncate, references, trigger') or has_table_privilege('service_role', c.oid, 'select, insert, update, delete, truncate, references, trigger')) as api_granted from pg_catalog.pg_class c where c.oid in (pg_catalog.to_regclass('private.blocks'), pg_catalog.to_regclass('private.reports'), pg_catalog.to_regclass('private.suspensions'), pg_catalog.to_regclass('private.moderators'), pg_catalog.to_regclass('private.blocked_terms'), pg_catalog.to_regclass('private.chat_rules_acceptances'))"
       supabase db query --linked "select (select bool_and(has_function_privilege('authenticated', f, 'execute')) from unnest(array['public.block_user(uuid,boolean)', 'public.my_blocks()', 'public.report_message(bigint,text,text)', 'public.report_user(uuid,uuid,text,text)', 'public.accept_chat_rules()']) f) as members_may_call, (select bool_or(has_function_privilege('anon', f, 'execute')) from unnest(array['public.block_user(uuid,boolean)', 'public.my_blocks()', 'public.report_message(bigint,text,text)', 'public.report_user(uuid,uuid,text,text)', 'public.accept_chat_rules()']) f) as anon_may_call, (select bool_or(has_function_privilege(r, f, 'execute')) from unnest(array['private.invited_by(uuid,uuid)', 'private.inviter_of(uuid)', 'private.chat_rules_version()', 'private.report_keep_days()']) f cross join unnest(array['anon', 'authenticated', 'service_role']) r) as helpers_granted, has_function_privilege('authenticated', 'public.claim_notification_deliveries(integer)', 'execute') as members_may_claim, private.chat_rules_version() as rules_version, private.report_keep_days() as keep_days, (select pg_catalog.pg_get_constraintdef(k.oid) like '%''report_filed''%' from pg_catalog.pg_constraint k where k.conrelid = 'private.notification_outbox'::regclass and k.conname = 'notification_outbox_kind_check') as kind_admits_reports"
       ```

       - Every count 0: the migration seeds no term and no moderator (step 5a does), and nobody has the chat build yet.
       - `tables` 6, `rls_on` 6, `with_policy` 0 and `api_granted` 0: no API role may read or write them, as for every private table (K-S5).
       - `members_may_call` true, `anon_may_call` false, `helpers_granted` false and `members_may_claim` false: the five calls are for `authenticated` only, the four helpers are the database's own, and the worker's claim, redefined, is still the sender's alone.
       - `rules_version` `2026-11`, `keep_days` 180 (R-Q3's default) and `kind_admits_reports` true.
     - **Advisors.** `rls_enabled_no_policy` gains six INFO lines, one for each new table in `private`: RLS on and no policy, as for `private.series_leaves` and the private tables the advisors already list (the connections' `hosted-advisors-after.json` holds 18 such lines for `private` tables). `unused_index` gains INFO lines for the four plain new indexes until they are used: `blocks_blocked_id_idx`, `reports_reporter_created_idx`, `reports_message_idx` and `suspensions_report_idx`. No `unindexed_foreign_keys` line: each new foreign key leads a primary key or an index. The five public calls are invokers and every new private function is a definer with an empty `search_path`, so neither `*_security_definer_function_executable` lint gains a line. **Expected: no new WARN and no ERROR.** Stop for anything else new.
     - Append this line to `supabase/tests/hosted-baseline/migrations.txt`:

       ```
       20261111160000_chat_safety.sql                         20261111160000
       ```

   - Then run the baseline with no candidate. It must pass from now on, with the three lines appended (`tests.txt` lists their tests):

     ```
     bash scripts/test-database-docker.sh --hosted-baseline
     ```

4. **Redeploy `deliver-notifications`, after step 2.** It carries chat core's chat words (its Task 4), the chat tap data and the claim loop with its `deferred` hand-back, and chat safety's moderators' push, the `report_filed` words and data (plan 3's Task 3). It also carries the follow-ups and circles wording if their redeploys are still pending. Once the owner approves it, the assistant runs the deploy from the repository root:

   ```
   supabase functions deploy deliver-notifications --no-verify-jwt --project-ref ewcsgvhuojxdpaspwsrx
   ```

   - **Not before step 2:** the old finish refuses `deferred` (the Order notes above).
   - Plan 2 makes no sender change of its own: its pushes are chat core's kinds, and who may be told changed in the database.
   - Plan 3's change is the moderators' push alone: "A new report is waiting." under "Resbite" (`supabase/functions/_shared/notification-copy.ts:167-171`), with the tap data `{type: "report", notificationId}` and no resbite (`notification-engine.ts:70`). The old sender would word a `report_filed` job as a generic `plan_update` push, so the moderators are set only after this step (5a).
   - `--no-verify-jwt` is required: without it the schedule's calls are refused. The secrets and the Vault entries stay as they are.
   - Afterwards the function list should show `deliver-notifications` ACTIVE and `verify_jwt` false. Its version is one more than the version before this redeploy.
   - Record under "Applied" the version before and the commit it was deployed from: a rollback puts that sender back first (Rollback, chat core's step 2).
   - An unauthenticated POST to the function URL should answer 401 from the handler (`supabase/functions/deliver-notifications/handler.ts:16-21`).
   - The owner then reads the schedule's runs after the redeploy with `! bash ~/ch1-sender-check.sh` (read-only):

     ```bash
     #!/bin/bash
     # Read-only: the sender's last runs after the redeploy (chat core, step 4).
     set -euo pipefail
     cd "${REPO:-$HOME/dev/resbite-app}"
     supabase db query --linked "select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'deliver-notifications') order by start_time desc limit 5"
     supabase db query --linked "select status_code, timed_out, error_msg, content, created from net._http_response order by created desc limit 5"
     ```

   - **The answer's shape** (`handler.ts:22-35`, `notification-engine.ts:173-175`). Read the status and the `error` field together:
     - HTTP 200 with `{"disabled":false,"processed":N,"deferred":M}` is a clean run. `deferred` counts the jobs handed back for the next run.
     - HTTP 200 with an `"error":"Notification claim failed"` field is a run that a later claim cut short. What it did stands, and the jobs it did not reach wait for the next run. **It is not a clean run, though its status is 200.**
     - HTTP 503 with `{"error":"Notification processing incomplete"}` is a run in which a journal call failed (`handler.ts:30-35`): the first claim (`notification-engine.ts:154-156`), or any validate or finish at any point of the run (`:165`, `:183-184` and `:217`). Each throws on a non-OK answer or its 10-second timeout (`notification-adapters.ts:78-80`), a `deferred` hand-back refused by an old finish included. What the run did before the failure stands. A 401 means the secret is wrong. `{"disabled":true,…}` means delivery is switched off.
     - Each run should succeed, and each call should answer 200 with `"disabled":false` and no `error` field.
5. **Realtime "Allow public access" off** (the owner, in the dashboard's Realtime settings, CH-P10), before the build reaches testers.
   - With it off, only private channels may be joined, so every join passes the policy of step 3.
   - Chat is the only Realtime use in the app (`mobile/src/state/chatSession.ts:1082`, a private channel), so nothing else changes.
   - Record the change and its time under "Applied".

5a. **The moderators and the blocked terms, in the SQL editor, after step 4** (G-S12, challenge N11). Not before step 4: a moderator set before the redeploy would get a report's push from the old sender as a `plan_update` push whose tap opens the reported resbite.
   - **The moderators** (step 0's "who moderates" and R-Q4). Paste `supabase/ops/moderators.sql` into the SQL editor, put the moderators' emails in its list (the owner's, and the backup reader's once named), and run it. It makes `private.moderators` exactly those accounts and prints `moderators` (how many) and `no_account` (each listed email no account holds). `no_account` should be empty: an email there is a typo, or an account not yet made.
   - **The blocked terms** (step 0's question). Paste `supabase/ops/blocked-terms.sql` into the SQL editor, put the owner's list in its array in the editor's copy only, and run it. It prints only `terms` (how many there are now) and `refused` (how many in the list break the rules; then nothing changes, and no term is printed). Never save the list in the repository or in this file. `refused` should be 0: otherwise fix the list (1 to 80 characters, a letter, digit or underscore first and last, words one space apart, none of `[ ] \ . ^ $ * + ? ( ) { } |`) and run it again.
   - **Release gate.** Read-only, with `! bash ~/ch3-gate.sh`:

     ```bash
     #!/bin/bash
     # Read-only: the release gate after step 5a (chat plan 3): how many blocked terms and moderators there are, and how
     # many of the moderators may use the app, so a report's push can reach them. Counts only: no term, email or id.
     set -euo pipefail
     cd "${REPO:-$HOME/dev/resbite-app}"
     supabase db query --linked "select (select count(*) from private.blocked_terms) as blocked_terms, (select count(*) from private.moderators) as moderators, (select count(*) from private.moderators m where private.user_eligible(m.user_id) and not private.deletion_pending(m.user_id)) as moderators_pushed"
     ```

     - **`blocked_terms` above 0, `moderators` at least 1, and `moderators_pushed` equal to `moderators`.** Otherwise the release waits: no build (step 6) and no submission (step 6a).
     - `moderators_pushed` counts the moderators who may use the app and aren't being deleted, the push's own test (`notification_recipient_eligible`'s `report_filed` branch). A moderator who may not is never pushed.
     - Record the three counts under "Applied", never a term or an email.

5b. **The support address, before the build** (step 0's first question; G-N10, challenge N9). The owner sets `EXPO_PUBLIC_SUPPORT_ADDRESS` in the EAS production environment, visibility plain text (the app shows it to everyone anyway). `mobile/.env.example` names it, commented.
   - Check it from `mobile/` with `npx eas env:list --environment production`: the variable is listed, and its value is an address (one `@`, a dot after it, no space). `supportAddress` treats anything else as unset, so a build would show no contact line.
   - **Submission is blocked until it is set:** step 6a checks that the installed build shows it.
   - The address itself goes in neither this file nor the repository: the build reads it from EAS.
6. **TestFlight build** (the owner's step), only after steps 2, 4, 5, 5a and 5b, with plans 2 and 3 in it. It goes to App Review only through step 6a, whose submission waits for step 7's "Chat safety (plan 3)" checks on this build.
   - Build from the merged head and upload through EAS, as the earlier runbooks do.
   - `EXPO_PUBLIC_*` values are fixed when the bundle is built. A build made before step 5b, or before a change to the address, shows the old value: make a new one.
   - **Testers update first (K-N8).** Every tester installs the chat build before people start chatting. Tell them before the build is released to their group.
     - Membership follows the reply, not the build. So a Going tester on an older build gets chat pushes.
     - On an older build, a chat push's tap does nothing: its `parseNotificationTarget` refuses the type `chat` and the extra `seriesId`.
     - With an older build open, no chat banner shows: its handler shows only `plan_update` pushes.

6a. **App Review** (challenge I8), the owner's step, before the build is submitted. With test accounts only.
   - **The review account.** A tester account Going on a group (its chat never closes while it repeats), or on a resbite a month or more away. In that chat a second tester account has written messages and posted one announcement, and the review account hasn't agreed to the chat rules yet, so the reviewer meets the rules sheet. The review account is also invited, and hasn't answered, to a second resbite: **a one-off some weeks away**, with an announcement to Everyone invited. Not a group: a group's announcement line is only its current occurrence's and goes at the next roll (ruling GR4), and once a resbite ends its card and page drop Report message. So a reviewer finds Report and Block in an open chat, on the invitation card and on the resbite page.
     - **How the reviewer gets in** (review I1). The review account signs in with **email and password** (Sign in): its email is on the tester roster and confirmed, and before submission its phone number is confirmed and its name set, so the reviewer meets no code, no add-phone screen and no waiting screen (`mobile/src/domain/accountRoute.ts:10-12`). Never SMS, Apple or Google sign-in: a reviewer can't receive the code or use the account. The owner confirms the number once, while setting the account up; the number goes nowhere in this file or the notes.
     - Its sign-in goes into App Store Connect's Sign-In Information for App Review, never into this file or the notes.
     - **No moderator hosts the review resbites** (review M2). The accounts that host the two resbites, the second account among them, are not in `moderators.sql`'s list, and neither is the review account. A report never pushes its reporter or the person reported, so a reviewer reporting the host must reach a moderator who is neither; `ch3-gate.sh`'s `moderators_pushed` still counts at least one.
     - Put the two resbites' titles into the notes' placeholders.
   - **On the installed build**, the one being submitted: Data & privacy shows the Contact topic with the support address, and a report's thanks shows it too. `EXPO_PUBLIC_*` is fixed when the bundle is built, so a value set after the build doesn't count.
   - **The listing** (CH-P13; review M3). App Store Connect's Support URL takes a web address, not an email, so the owner points it at a web page that shows the support address. In the app, the Contact topic already shows it.
   - **R-Q4 is answered:** a backup reader is named and is on `moderators.sql`'s list (step 5a; `ch3-gate.sh` again then reads `moderators` 2 or more). "Applied" records that one is named, never who.
   - **Then submit, once step 7's "Chat safety (plan 3)" checks have passed on the build being submitted** (review I2): they are the first to show, against hosted, what the notes promise (a report reaching the team, a blocked term refused, Report and Block from every place, the team's removal). Paste the review notes into App Store Connect's Notes for App Review: the text in `app-store-review-notes.md`'s block, with its three placeholders filled. It is under 4,000 characters, the field's limit.
   - Record the submission's date under "Applied".
7. **Device checks** (Ana as host, Pedro and Clara as guests, Sol invited and not answered). Use two phones, signing in as each account in turn where needed. Use tester accounts, and never write a real number or account id in this file. They need steps 2 to 6 and the new build, and run in this order.
   - **Live delivery, with the app open.** Ana and Pedro, both Going, open the chat on two phones. Pedro sends "I can bring the snacks".
     - It appears on Ana's open screen within a few seconds, well before the 20-second poll (`POLL_MS`, `mobile/src/state/chatSession.ts:35`). Send twice more: each arrives as fast. That shows the phone's join of `chat:<series>` passed the policy.
     - Then the real `realtime.messages` row, read-only:

       ```
       ! bash -c 'cd "${REPO:-$HOME/dev/resbite-app}" && supabase db query --linked "select count(*) as chat_broadcasts from realtime.messages where topic like '"'"'chat:%'"'"' and inserted_at > now() - interval '"'"'5 minutes'"'"'"'
       ```

       It should be at least 1.
   - **A refused subscribe (the policy's topic condition).** A join is allowed only for a topic that is exactly `chat:<lower-case uuid>`, from a caller who passes `private.user_eligible`, and who is in that chat now (`can_listen`, `supabase/migrations/20261111140000_chat_core.sql:1117-1123`). The phone check above shows the allowed side.
     - For the refused side, the owner asks the database what Realtime asks it, for the tester who sent the newest message, right after Pedro's sends above: `! bash ~/ch1-listen-check.sh`. It takes no argument. It finds his account, his chat and a chat he is not in by itself, so no id is typed, printed or kept, and nothing is written. One statement sets his claims for its own transaction only, then asks `can_listen` three times.

       ```bash
       #!/bin/bash
       # Read-only: may the tester who sent the newest chat message listen to their chat's channel, to a chat they are not
       # in, and to their own topic in capitals, as Realtime's policy asks (chat core, step 7)? One statement, no argument:
       # it finds the ids itself and prints five booleans, nothing else. The claims it sets end with its transaction.
       set -euo pipefail
       cd "${REPO:-$HOME/dev/resbite-app}"
       supabase db query --linked "select t.uid is not null and t.claims is not null as tester_found, t.other is not null as other_found, coalesce(private.can_listen('chat:' || t.mine::text), false) as their_chat, coalesce(private.can_listen('chat:' || t.other::text), false) as another_chat, coalesce(private.can_listen('chat:' || upper(t.mine::text)), false) as upper_case_topic from (select 1) as one left join lateral (select x.uid, x.mine, x.other, pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', x.uid, 'role', 'authenticated')::text, true) as claims from (select m.author_id as uid, m.series_id as mine, (select p.series_id from public.plans p where not private.chat_member(p.series_id, m.author_id) order by p.starts_at desc, p.id desc limit 1) as other from public.messages m where m.kind = 'message' and m.author_id is not null order by m.id desc limit 1) as x offset 0) as t on true"
       ```

       - Expected: `tester_found`, `other_found` and `their_chat` true; `another_chat` and `upper_case_topic` false.
       - Run it before anyone else writes in a chat, or it asks about whoever did. `tester_found` false means no message yet.
       - `can_listen` takes who is asking from the claims alone, so asking as the CLI's role gives what Realtime gets as `authenticated` (step 3 checks that `authenticated` may call it).
       - It was rehearsed on a local replay through a stand-in for the CLI, after a message from one tester (the checks above).
       - If the dashboard's Realtime inspector can join a private channel as a chosen user, joining `chat:<another series>` as that tester should be refused too.
   - **A push, with the app closed.** Pedro sends while Ana's app is closed. Ana's phone shows "<title>" over "Pedro: …".
     - Over 120 graphemes, the words end with "…".
     - The tap opens the chat.
   - **An announcement banner while Resbite is open on My resbites, and none for a chat on screen (K-S9).**
     - Ana announces to Everyone invited while Pedro has My resbites open. A banner shows "Announcement from Ana: …".
     - With that chat open on Pedro's phone, a new message shows no banner. With another chat open, it does (`showsInForeground`, `mobile/src/domain/reminders.ts:73-84`).
   - **One push a minute, in a lively chat.** Pedro sends five messages within a minute. Ana's phone gets one push, the first one's. The rest arrive in the chat with the unread dot.
   - **Mute.**
     - With Mute chat on, Ana gets no message push, and announcements still arrive.
     - With Mute this resbite on, neither arrives.
   - **A host's removal blanks the other phone's open chat (K-B1).** Ana removes one of Pedro's messages while Pedro has the chat open. On Pedro's phone the bubble reads "Message removed by an admin", with no text, within a few seconds.
   - **A removed guest's open chat refuses.** Ana removes Pedro from the resbite while his chat is open. His screen shows "You’re not in this chat." and the field goes. The channel is removed at once (K-N1), and no later message or push about this chat reaches him.
   - **A pending invitee's announcement tap opens the event (K-B4).** Sol, invited and not answered, gets Ana's Everyone invited announcement. Its tap opens the resbite, never the gone note. The invitation card on My resbites shows "Announcement from Ana · …".
   - **The composer with the keyboard up (K-S15).**
     - The field sits right on the keyboard, with no gap above it.
     - The list holds its place as the keyboard rises and falls, and drags the keyboard down interactively.
     - While the keyboard shows, the pinned card collapses to one line and the closing line hides.
     - The build keeps `KeyboardAvoidingView` (`mobile/app/chat.tsx:775`), so this check decides it.
   - **VoiceOver and Larger Text.**
     - On a bubble, the rotor's actions offer Delete message (own) or Remove message (host) (`chat.tsx:1236` and `:1273`).
     - At the largest Larger Text, the composer, the pinned card and the closed card fit at 320 points with nothing clipped.
     - A long-press right after the chat loads opens the actions sheet on the right message.
   - **The pinned card's jump in a long chat** (SR10; chat core's H35 I1). In a chat long enough to load earlier pages, a tap on the pinned card lands with the announcement on screen. On Expo web the jump left it just above the screen in 2 of 14 runs, when the rows above it were measured late (Known gaps); this check decides how it lands on the phone.
   - **VoiceOver swipe order** reads newest first, each label carrying its day ("Leo, I can bring the snacks, Sat 15 Nov, 18:02"). **TalkBack** does the same, when the Android build exists.
   - **Expo web (review only).** A long-press right after a refocus read opens the right message's sheet. Releasing a long-press on a link (`LinkText`, `chat.tsx:1336`) does not also open the link's confirm.
   - **Send enables for "🎉" alone.** The visible-text rule matches astral characters on Hermes (`hasVisibleText`, `mobile/src/domain/chatRules.ts:629`).
   - **A link's long-press on iOS** opens the message's actions, not the browser. A tap asks "Open example.com?" first.
   - **At the 1,000 limit on iOS,** a paste past the limit is cut and VoiceOver says "Only the first 1,000 characters fit.". Every cut announces it (`sayTooLong`, `chat.tsx:137-139`, called at `:422`, and at `:1614` in the Announce sheet), so typing on at the limit may repeat it on each keystroke. This check decides whether that repetition is acceptable.
   - **The 48-hour close.** On a one-off that ended, the line under the pinned card reads "This chat closes <day> at <time>, in N hours. Any final words?", then minutes in the last hour.
     - At the close, the field gives way to "This chat closed on <day>." and the reason, without leaving the screen. A message typed then stays under the card as "Not sent:".
     - The Chat row reads "Chat closed · N messages".
     - Delete and Remove still work (K-S17's default).
   - **Groups (plan 2).** Ana makes a resbite that repeats every week, with Leo, Pedro and Clara invited; Leo and Clara are Going, and Pedro says Can't go. Ana makes Leo an admin (not Clara, who leaves later). Sol is invited after the first roll. Run on a test resbite only; it takes two weeks, two rolls.
     - **The chat carries on to next week.** The header reads "Every Thursday · N in the group". Pedro, who said Can't go, still reads and writes, and the chat shows "Pedro can’t make it this week". After the first roll the chat shows "<title> ended" and "Next one: <day> · <place>", and Pedro is still in it.
     - **No line for anyone carried** (G-B6). After the roll there is no "joined" and no "admin" line for anyone the roll carried, Leo the admin included.
     - **Right after the roll, a pending member sees every name.** Pedro, whom the roll carried not answered, opens the people list from the resbite page: everyone, under "Not answered yet" and the rest, with Connect, and no number.
     - **The place.** Pedro, who hasn't answered this week, reads "Next one: <day>" with no place (I11), and his invitation card on My resbites carries the unread dot after someone writes (I3).
     - **An old "Next one" line opens this week's resbite** (I5). After the second roll, Sol, invited after the first, taps the first roll's "Next one" line: it opens this week's resbite, never the week it named.
     - **Leave group, online and offline.** Clara leaves from the chat's menu: the question names the resbite and its weekday, and Leave group lands on My resbites, without the group. The chat shows "Clara left the group" to the others, and nobody gets a push. Offline, the question stays with "Check your connection and try again." and Leave group works once back online. Invite Clara again: she is back, and told.
     - **Leave this group from the resbite page** (I10) lands on My resbites.
     - **Stopping.** Ana sets "Doesn't repeat": the chat shows "Ana stopped repeating this · the last one is <day>", and the closing line appears 48 hours before it closes. Ana sets "Every week" again: that line goes (I8, G-QB's default).
     - **The goodbye window** (P2-Q1). After "Cancel this and stop repeating", a message from one phone is pushed to the other during the 48 hours. Then the chat closes with "This group’s chat closed on <day>.".
     - **At the largest Larger Text,** the group header's second line wraps whole at 320 points.
   - **Chat safety (plan 3).** The owner's account, a moderator since step 5a, is signed in on one phone, and the other accounts on the others in turn. Ana hosts a one-off with Pedro, Clara and Mia Going and Sol invited, not answered; Mia never writes in its chat. A blocked term comes from the owner's list; never write one here. App Review's submission (step 6a) waits for these checks to pass.
     - **The rules come first.** Pedro, who never agreed, writes his first message: the rules sheet comes before anything is sent, and I agree sends it once. Then, for the refusal: in the SQL editor, delete a test account's acceptance by its email, typed in the editor's copy only (`delete from private.chat_rules_acceptances a using auth.users u where a.user_id = u.id and lower(u.email) = '<the test account's email>'`), while that account's chat is open on its phone, and send: the sheet says "Your message hasn’t been sent. Agree to the chat rules to send it.", and I agree sends it once.
     - **A blocked term is refused.** A message holding a listed term, in capitals too, reads "That message can’t be sent." and is not stored. The same term inside a longer word is sent.
     - **A block hides at once (B3).** Pedro blocks Clara from People in this chat, then goes Back to the chat: Clara's messages, and the unread dot for them, are already gone, with no refocus, and on the resbite page the Chat row no longer shows her last line (the row's title alone when hers was the last). (Blocking a host the same way also takes their pinned card off; an earlier announcement takes the pin.) Data & privacy → Blocked people lists her, with "Blocked <day>" under her name.
     - **The blocked person sees nothing.** While blocked, Clara asks Pedro to connect: she sees "Request sent", and Pedro gets no request and no push. Clara's next messages reach Ana, and neither reach nor push Pedro.
     - **Unblock (B3).** Pedro unblocks Clara in Blocked people, then goes Back to the chat: her messages are back. No connection a block ended comes back.
     - **A host's block** (R-Q6). Ana's Block confirm for Pedro ends with "This hides their messages from you only. To stop them for everyone, remove them from the resbite."
     - **An announcement's author line** (SR10). An announcement card shows its author's name above it. Tapping the name opens their sheet with Report and Block, even after they have left the resbite.
     - **A block the server didn't store** (ruling SR9). Mia, who hasn't written in the chat and shares no other resbite or connection with Pedro, is removed by Ana while Pedro has her Block confirm open: Block then closes the confirm with no message, Blocked people doesn't list her, and no earlier chat error comes back.
     - **A report reaches the team (Task 3).** Pedro reports one of Clara's messages: the thanks shows the support address. The moderator's phone shows "A new report is waiting." under "Resbite", with no name or words; its tap opens nothing; with Resbite open it shows as a banner. Signing out clears it from Notification Center. A second report within 10 minutes pushes nothing more.
     - **The team's removal.** `remove-reported-message.sql` on that report (the reports queue, below), while Pedro and Clara have the chat open: the bubble reads "Message removed by Resbite" within a few seconds.
     - **Report from everywhere** (I8). Report from a message's long-press, from a person's sheet (the author's name over a bubble, about 33 points tall, and the menu's Report or block), from an invitation card's long-press and from the resbite page: each sends, and each thanks shows the address. Data & privacy's Contact topic shows the address, selectable, with Copy address and a mail link, in the installed build.
     - **An unanswered invitee's resbite page with an announcement** (B1). Sol opens it, with Ana's Everyone invited announcement from the checks above: "Report or block" beside the announcement line offers Report message and Report and Block for Ana. Report message sends; Block Ana stores, and the line goes.
     - **An invitee brought by a guest, with no announcement** (B4, I-2). Leo, a guest Ana trusts to bring people, brings Clara to another of Ana's resbites; Clara doesn't answer. The card's long-press on My resbites and the page's More offer Report and Block for Leo and for Ana. Block Leo stores: Leo is in Clara's Blocked people.
     - **A host who blocked a bringer** (I-3). Ana blocks Leo, then Clara says Going: Ana's push reads "Clara is going.", with no "brought by".
     - **Connections** (I3). Block from a request card and from a connection row, and Report from a request card: each closes its sheet, and after a block the card or row goes, "Blocked <name>." is announced and focus moves to the next card.
     - **The report sheet at the largest Larger Text,** with the keyboard open: it scrolls to Send report, with nothing clipped at 320 points.
     - **VoiceOver.** On someone else's bubble, the rotor's actions offer Report message. The author's name over a bubble, and the menu's Report or block (the full-size way in), each open the person's sheet. After an unblock in Blocked people, the chat's person sheet or the people list, VoiceOver says "Unblocked <name>." and focus moves on.
     - **TalkBack, when the Android build exists.** It reads "Unblocked <name>." after an unblock in Blocked people, the chat's person sheet or the people list, and Connections' "Blocked <name>." after a block there. Each is a live region inserted with its text, unverified on Android so far.
8. **Throughput check during the first busy chat hour (K-B3.5).** Read-only, every 10 minutes or so, with `! bash ~/ch1-throughput.sh`:

   ```bash
   #!/bin/bash
   # Read-only: the outbox's queue, the deliveries waiting and the sender's last hour (chat core, step 8).
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   supabase db query --linked "select count(*) as waiting, count(*) filter (where kind in ('chat_message', 'announcement')) as chat_waiting, coalesce(max(now() - created_at), interval '0') as oldest_wait from private.notification_outbox where expanded_at is null"
   supabase db query --linked "with r as (select status_code, case when left(content, 1) = '{' then content::jsonb end as body from net._http_response where created > now() - interval '1 hour') select count(*) as calls, count(*) filter (where status_code = 200 and body->>'disabled' = 'false' and body->>'error' is null) as clean, count(*) filter (where status_code = 200 and body->>'error' is not null) as cut_short, count(*) filter (where status_code is distinct from 200) as failed_or_timed_out, coalesce(sum((body->>'processed')::int), 0) as processed, coalesce(sum((body->>'deferred')::int), 0) as deferred from r"
   supabase db query --linked "select count(*) filter (where o.kind in ('chat_message', 'announcement')) as chat_pending, count(*) filter (where o.kind not in ('chat_message', 'announcement')) as other_pending, coalesce(max(now() - o.created_at) filter (where o.kind in ('chat_message', 'announcement')), interval '0') as oldest_chat_notice, coalesce(max(now() - o.created_at) filter (where o.kind not in ('chat_message', 'announcement')), interval '0') as oldest_other_notice from private.notification_deliveries d join private.notification_outbox o on o.id = d.outbox_id where d.state = 'pending'"
   ```

   - `waiting` stays under 100, and `oldest_wait` under 2 minutes.
   - **A report's push is not chat** (plan 3). `report_filed` counts under `other_pending`, never `chat_pending`, and the claim takes it before any chat job, so a busy chat never holds back a moderator's push.
   - **The second line shows where a chat backlog waits.** The claim expands up to 100 outbox rows at a time, so a chat backlog sits as `pending` deliveries behind other kinds, not as unexpanded rows in `waiting`. Trouble is `oldest_chat_notice` over 1 hour: the sender drops a chat message push that old (an announcement after a day), without a trace in the other counts. `chat_pending` growing for several runs, or `other_pending` waiting with `oldest_other_notice` over 2 minutes, is also trouble.
   - **The check keys on the status and the `error` field together.** `clean` equals `calls`, and `cut_short` and `failed_or_timed_out` are 0. A run cut short by a later claim answers 200 with `error` set, so it counts under `cut_short`, never `clean`.
   - `deferred` above 0 in a burst is the loop handing back jobs it had no time for; the next run takes them. Many runs with `deferred` above 0, or any `failed_or_timed_out`, bring back step 0's budget question.
   - **A `plan_changed` made then reaches the other phone within two minutes.** Ana changes the time of another resbite Pedro is Going to while the chat is busy (the claim expands and sends it before the chat kinds, `supabase/migrations/20261111140000_chat_core.sql:712` and `:743`).

## The reports queue

From the release on, a standing duty, not a rollout step (challenge N11). It is how the team meets the review notes' promise: the queue checked daily, and content removed and accounts suspended within 24 hours of a report. Everything here runs in the hosted project's SQL editor, by the owner or a moderator: there is no screen for it (challenge N8). What it shows (a report's words, names, an account id kept for an undo) stays there. This section is the spec's note on reviewing reports (its file list names a `supabase/ops/README`; the plan puts the note here, beside the steps that set the queue up).

- **Who reads it.** The moderators in `private.moderators` (step 5a). **Until R-Q4's backup is named, the owner alone reads the queue daily.** Once one is named, the backup reads it whenever the owner is away.
- **When.** A moderator's phone shows "A new report is waiting." for a new report, at most once in 10 minutes each; the push holds no name and no words, and its tap opens nothing. Every day, push or not, a moderator runs `supabase/ops/open-reports.sql` (nothing to edit, read-only). Its one result lists:
  - `report`: every open report, oldest first, with its reason, the reporter's own words (`details`), the reported message's words as they were when reported (`frozen_body`; none for a report about a person), who reported, who was reported, and the resbite with its date;
  - `block`: every block of the last 7 days, newest first: who blocked whom, and when (R-Q2, I10). No message and no push. A block is the blocker's own choice and needs no action on its own; several blocks of one person point the team to what that person wrote;
  - `due`: one row while closed reports are due for deletion, saying how many and to run `purge-closed-reports.sql`.
- **For each report, the target is to act within 24 hours of it** (its `created_at`):
  1. Read it. A report's words, and the reported message's frozen words, are what the reporter and the reported person wrote; nothing else of the chat is in the report.
  2. **To remove the message:** `supabase/ops/remove-reported-message.sql`, the report's `id` in its one literal. It locks the chat row first, then removes the message if it is still a sent message or announcement: no words, `payload {"by": "resbite"}`. Open chats get it within seconds as "Message removed by Resbite" (a build without plan 3 reads "Message removed by an admin"), the count drops, a pinned announcement unpins, and no push goes out for it. It prints the message id and its final state: `removed`, or `deleted` when its author deleted it first. Run again, it changes nothing.
  3. **To suspend the account:** `supabase/ops/suspend-account.sql`, the report's `id` in its one literal. It disables the person's tester roster row, if any, and revokes their live grant, if any, so they may no longer use the app: no reads, no writes, no pushes. It prints `account` (the suspended account's id: keep it in the SQL editor for an undo, never here), `roster_rows_disabled` and `grants_revoked`. Then **the owner bans the account in the Auth dashboard** (Authentication → Users), so it can't sign in either.
  4. **Close it:** `supabase/ops/close-report.sql`, its one row `(report_id, status, action, note)`: status `reviewed` when nothing was done, `actioned` when something was; action `none`, `message_removed`, `account_suspended` or `both`; a short note, with no name, number or email. It closes only an open report, and prints the closed row; run again, or with another status, it prints no row and changes nothing, so a closed report's 180 days never start again. When the reported person's profile has gone, or their account is being deleted, it also forgets who the report was about.
- **With a `due` row:** `supabase/ops/purge-closed-reports.sql` (nothing to edit). It deletes the reports closed more than 180 days ago (R-Q3, `private.report_keep_days()`), and on other closed reports forgets an account that has gone. It prints `deleted` and `cleared`.
- **Undoing a suspension made in error.** The undo is the commented statement at the end of `suspend-account.sql`, with the suspended account's id in its literal: the id `suspend-account.sql` printed, or `select user_id, report_id, at from private.suspensions` lists the suspensions on record.
  - It puts back only what that suspension changed (the roster row it disabled, the grant it revoked, by the time it revoked it), so an earlier ban or revocation stays, and deletes the record. It prints `roster_rows_enabled` and `grants_restored`. Lift the Auth dashboard ban by hand.
  - The record is kept by the suspended account in `private.suspensions` (ruling SR8's M1), not on the report. So the undo works after the report is closed, purged 180 days later, or gone with its reporter's account, until the undo runs. It is gone only after the chat safety rollback (Rollback, below, says to undo first) or once the account itself is deleted from Auth.
  - **Without a record, restore by hand.** First read the account's state now, in the SQL editor (read-only; the id in the editor's copy only). It reads no table of plan 3's, so it works after the rollback too:

    ```sql
    with input(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid))
    select (select count(*) from private.tester_roster t join auth.users u on t.email = lower(u.email) where u.id = i.user_id and t.enabled) as roster_enabled,
     (select count(*) from private.tester_roster t join auth.users u on t.email = lower(u.email) where u.id = i.user_id and not t.enabled) as roster_disabled,
     (select count(*) from private.beta_access b where b.user_id = i.user_id and b.revoked_at is null) as live_grants,
     (select max(b.revoked_at) from private.beta_access b where b.user_id = i.user_id) as last_revoked_at,
     private.user_eligible(i.user_id) as may_use_the_app
    from input i;
    ```

    Then put back only what the suspension changed, as the undo statement does: the roster row's `enabled`, or the grant whose `revoked_at` is the suspension's time. An earlier ban stays.
- **What the queue can't do.** A guest a host removed can't report that host in the app (Known gaps): the support address on Data & privacy covers it, and the owner answers such an email by hand. A report whose reporter deleted their account before the read is gone with them (CH-P18).

## Applied

Nothing yet. Each step's record goes here when it is done, as in the earlier runbooks. Step 0's answers go here first.
- For R-Q4, record that a backup reader is named, and the date, never who: no name, number or account id in this file.
- For step 5a, record the gate's three counts, never a term or an email. For step 5b, that the address is set, and the build that carries it.

## Rollback

Only with the owner's approval, in one transaction.

**The full order, newest first (NOTE 5).** Roll back in this order only: chat 3 (plan 3, this file's safety part), chat 2 (plan 2, this file's groups part), chat 1 (chat core), circles, follow-ups, connections, creating-a-resbite. Then the earlier ones, as the creating-a-resbite runbook lists.

- **The guarded chain** is chat 3 → chat 2 → chat 1 → circles → follow-ups. Each refuses to run too early, and a refusal changes nothing.
  - Plan 3's rollback goes first. Run where plan 3 isn't applied, it fails at its `lock table` and changes nothing.
  - Plan 2's rollback refuses while plan 3 is applied.
  - Chat core's rollback refuses while plan 2's `private.series_leaves` exists (NOTE 4), with "Run the chat groups rollback before the chat core rollback" (`supabase/rollback/20261111140000_chat_core.rollback.sql:44-49`).
  - The circles rollback refuses while `public.messages` exists, with "Roll back the chat migrations before the circles-of-trust rollback" (`supabase/rollback/20261111130000_circles_of_trust.rollback.sql:47-48`). Without that guard, rolling circles back would put the pre-chat claim and deletion bodies under plan 1. With plan 2 applied, every group roll would also fail on `brought_by`.
  - The follow-ups rollback refuses while circles is applied.
- **Below the chain nothing guards.** The connections and creating-a-resbite rollbacks have no guard against chat. Their files belong to live runbooks, so they stay unchanged. **Never run either while chat is applied.** The connections one would take the chat kinds out of the outbox's check, and the chat branch out of who may be told, under a live chat.

**Chat safety's steps** (plan 3), first. In them, "this file" is chat safety's rollback, `supabase/rollback/20261111160000_chat_safety.rollback.sql`.

1. **The app first** (challenge I9), as chat core's step 1 below. A build with plan 3's app can't write against a database without it. `chat_summary` has no `rules_accepted` there, so every Send opens the rules sheet, and I agree calls `accept_chat_rules`, which is gone. Its people lists get no `my_blocks`, so they show no Block and no Connect. And chat without report and block may not reach testers (the spec's Anti-goals). So a chat 3 rollback means making a build without chat the testers' build first, or rolling back all three plans.
2. **The sender stays** for a chat 3 rollback alone (challenge I9). It sends nothing of this plan's once this file has deleted the `report_filed` notices, and it is the chat sender chat core needs. It goes back only with chat core's rollback (chat core's step 2, below).
3. **Undo any suspension made in error first** (the reports queue). This file drops `private.suspensions`: an account suspended with `suspend-account.sql` stays suspended, and the record of what to put back goes with the table.
4. The owner runs `! bash ~/ch3-rollback.sh`, in `ch1-rollback.sh`'s and `ch2-rollback.sh`'s shape. It checks the hash, runs the file in one transaction, with no psql `\i`, and takes a fingerprint:

   ```bash
   #!/bin/bash
   # The chat safety rollback (chat plan 3). Only with the owner's approval, once a build without chat is the testers'
   # build (or with the rollback of all three plans), and before chat groups' rollback.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/chat-release
   F=supabase/rollback/20261111160000_chat_safety.rollback.sql
   echo "990cc9b0d0391173c888dc2155044795b4fbadd5d1b47131223dcc417e40a1d6  $F" | sha256sum -c -
   mkdir -p /tmp/ch3 && { echo 'begin;'; cat "$F"; echo; echo 'commit;'; } > /tmp/ch3/rollback.sql
   supabase db query --linked -f /tmp/ch3/rollback.sql
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-rollback-safety.json"
   ```

   - The script stops before running anything if the hash differs.
   - `hosted-after-rollback-safety.json` should equal chat groups' `hosted-after-groups.json` by definition: 479 of 479, with the same 15 `acl` differences. Wrapped this way, the rollback did exactly that locally.
   - If it stops with "deadlock detected", nothing has changed: run it again. The worker's claim, a chat being opened or a block being made can meet it mid-way (its header, lines 46-47).
   - Run again after it succeeded, it fails at its `lock table` (`private.chat_rules_acceptances` is gone) and changes nothing.
5. **What it does** (its header, lines 1-52).
   - **What is lost, with nobody told** (G-N11): every block, every report, open or closed, with its frozen words, every moderator, every acceptance of the chat rules, every blocked term and every suspension's record, and every `report_filed` notice, sent or not, with its deliveries. A connection a block ended doesn't come back. Pushes already sent are not recalled.
   - It drops the five calls in both schemas, the four helpers and the six tables, puts back chat core's thirteen kinds in the outbox's check, and restores fourteen bodies byte for byte, keeping their grants (thirteen on hosted): chat core's seven, plan 2's four, and the connections', circles' and phone_key's one each.
   - **What people notice:** a blocked person's messages, announcements, pushes and invitations reach the blocker again; nobody is asked to agree to the chat rules, and no term is refused; a message the team removed stays removed, and a build without plan 3 words it "Message removed by an admin"; the daily read of reports and blocks is gone, and the scripts in `supabase/ops/` that read or write the six tables fail.
   - It goes before plan 2's: plan 2's rollback refuses while `private.blocks` exists, and this file drops it.
6. Remove this migration's line from `supabase/tests/hosted-baseline/migrations.txt`. The hosted migration history row stays.

**Chat groups' steps** (plan 2), before chat core's.

1. Plan 3's rollback first, when plan 3 is applied (chat safety's steps, above): plan 2's refuses while `private.blocks` exists.
2. The owner runs `! bash ~/ch2-rollback.sh`, in `ch1-rollback.sh`'s shape. It checks the hash, runs the file in one transaction, with no psql `\i`, and takes a fingerprint:

   ```bash
   #!/bin/bash
   # The chat groups rollback (chat plan 2). Only with the owner's approval, after chat plan 3 is rolled back, and before
   # chat core's rollback.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/chat-release
   F=supabase/rollback/20261111150000_chat_groups.rollback.sql
   echo "100f23695dd9e5d417b10f2ca5c2668864b391a81503d1bebde3a1fd884190aa  $F" | sha256sum -c -
   mkdir -p /tmp/ch2 && { echo 'begin;'; cat "$F"; echo; echo 'commit;'; } > /tmp/ch2/rollback.sql
   supabase db query --linked -f /tmp/ch2/rollback.sql
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-rollback-groups.json"
   ```

   - The script stops before running anything if the hash differs.
   - `hosted-after-rollback-groups.json` should equal chat core's `hosted-after.json` by definition: 464 of 464, with the same 15 `acl` differences. Wrapped this way, the rollback did exactly that locally.
   - Run again, it fails at its `lock table` (`private.series_leaves` is gone) and changes nothing.
3. **What it does** (its header, lines 1-46).
   - **What is lost, with nobody told** (G-N11): every leave record; every group flag's value (`is_group` goes back to false on every row; chat core's rollback drops the column with its table); every stop time.
   - It drops the two triggers, the nine functions and `private.series_leaves`, and restores twelve bodies byte for byte, keeping their grants: chat core's nine, `my_chat_overview` among them, `can_see_guests` (creating a resbite), `request_connection` (follow-ups) and the circles roll.
   - **What people notice:**
     - the restored roll writes `admin` lines again for the admins it carries, carries again someone who left after the end, at the next roll, and rolls a group whose owner may use the app again, even one whose chat had closed;
     - members who haven't answered, and Can't-go members, lose a group's chat at once: the one-off rule applies to every chat;
     - a cancelled week's group messages and announcements are not pushed;
     - a member who hasn't answered reads the place in "Next one" and place-change lines again (G-QA's default undone), and rows lose `plan_id`, so the chat build reads every announcement as this week's (GR1);
     - after a roll, a group's last announcement before it is pinned again and, sent to everyone, shows under next week's invitation on My resbites and the resbite page for everyone who hasn't answered (ruling GR4);
     - this plan's lines stay in the chats; the chat build words them, and a build without plan 2 words them as no line;
     - the chat build's resbite pages keep working after it, since `readEvent` reads a missing `series_is_group` as not a group (I4), and neither screen offers Leave any more. So the app need not be rolled back for this file alone.
4. Remove this migration's line from `supabase/tests/hosted-baseline/migrations.txt`. The hosted migration history row stays.

**Chat core's steps.** In them, "this file" is chat core's rollback, `supabase/rollback/20261111140000_chat_core.rollback.sql`.

1. **The app first.** Once this file has run, a chat build gets errors from every chat call and a refused channel. Make a build without chat the testers' build first, or accept that the Chat row hides, the chat screen fails and chat pushes stop until one is.
2. **The old sender goes back before or with this file.** The rollback restores `finish_notification_delivery` from `20261030120000_push_delivery.sql`, which refuses `deferred` again (rollback header, lines 21-25).
   - Against the restored finish, a hand-back from the chat sender fails. The job stays leased as `sending`, and the next claim after the lease marks it `unknown`, never sent.
   - So first redeploy the sender chat core was built on: the circles build's sender, with the follow-ups and circles words and no chat. It is the `supabase/functions` directory whose tree id is `1ea91086716d9e0b566e5d21bdd693d0b333b392`, at commit `5772898` on this stack. Commit ids change when work is cherry-picked or rebased, the tree id does not. In your checkout, find a commit that has it with `git log --all --format=%h | while read c; do [ "$(git rev-parse "${c}:supabase/functions" 2>/dev/null)" = 1ea91086716d9e0b566e5d21bdd693d0b333b392 ] && echo $c; done`, and deploy from one of those.
     - If the follow-ups and circles runbooks redeployed their own sender before this sitting, it is also the version recorded under "Applied" as live before step 4.
     - If step 4 carried their words instead, the version before step 4 lacks them, so redeploy from a commit with that tree id, not that one.
     - It handles a chat job as a generic push until the rollback removes those jobs.
3. The owner runs the rollback with `! bash ~/ch1-rollback.sh`. It checks the hash, then runs the file in one transaction, with no psql `\i`, and takes a fingerprint:

   ```bash
   #!/bin/bash
   # The chat core rollback. Only with the owner's approval, after chat plans 3 and 2 are rolled back and the old sender is back.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/chat-release
   F=supabase/rollback/20261111140000_chat_core.rollback.sql
   echo "d212e53eacb904a260bbdd3c371ddc7424829ea7a5b7d6c98b3e7c89fb132214  $F" | sha256sum -c -
   mkdir -p /tmp/ch1 && { echo 'begin;'; cat "$F"; echo; echo 'commit;'; } > /tmp/ch1/rollback.sql
   supabase db query --linked -f /tmp/ch1/rollback.sql
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-after-rollback.json"
   supabase db query --linked "select count(*) as realtime_policies from pg_catalog.pg_policies where schemaname = 'realtime'"
   ```

   - The script stops before running anything if the hash differs.
   - `hosted-after-rollback.json` should equal the circles `hosted-after.json` by definition: 387 of 387, with the same 15 `acl` differences. `realtime_policies` should be 0. Wrapped this way, the rollback did exactly that locally.
   - Run again, it fails at its `lock table` (the tables are gone) and changes nothing.
4. **What it does** (its header, lines 1-42).
   - **What is lost, with nobody told:**
     - every chat: every message, announcement and system line, every read and every mute;
     - every `chat_message` and `announcement` notice, sent or not, with its deliveries. A chat push not yet sent is never sent. Sent pushes are not recalled.
   - It drops the policy `chat_members_listen`, the seven triggers, every function the migration made, the outbox's `message_id` with its index, `notification_outbox_recipient_kind_idx` and the four tables.
   - It restores five functions, each keeping its grants:
     - `notification_recipient_eligible` (connections);
     - `claim_notification_deliveries` and `fold_web_account` (circles);
     - `finish_notification_delivery` (push delivery);
     - `request_account_deletion` from the circles body, only where it exists (K-N9, BLOCKING 1; rollback lines 262-313). On the hosted project it does not exist yet, and nothing is done.
   - It puts back the outbox's kind check with its eleven kinds. It locks the plans, guests, admins, the chat tables and the outbox first. Reads of them wait until it commits.
   - Everything else is kept: the resbites, their guests and admins, and every other notice.
5. **Realtime's setting can stay off.** No app uses a public channel. The broadcasts already in `realtime.messages` are Realtime's own and expire with it.
6. Remove this migration's line from `supabase/tests/hosted-baseline/migrations.txt`.
   - The hosted migration history row stays, as the earlier rollbacks left theirs. Never run `supabase migration repair --status reverted`.

## Known gaps

Accepted during the build, unless marked; none blocks the rollout.

- **A minute's first message deleted before delivery** (K-S1, Decision 6). That minute then pushes nothing: the later messages were never queued.
- **A bare signal after a removal** (K-N1). A removed person's open socket may still hear a bare `{id, kind, state}` until its token refreshes. It never carries words, and their next read is refused.
- **A minute's first message read before the claim** (same kind as K-S1, H42). Its reader gets no push for it, and none for the rest of that minute: the later messages were coalesced into that first notice and never queued for them. Their unread count still shows them.
- **A line committing late can sit below a read mark** (`supabase/migrations/20261111140000_chat_core.sql:886-889`). A system line, or a message that waited on its plan's row, takes no chat lock. One that commits after a reader marked a later id read never reads as unread. `chat_messages_since` still brings it.
- **Account deletion is local only.** On hosted no account can be deleted yet, so the chat's deletion step (`supabase/migrations/20261111140000_chat_core.sql:805-877`) runs nowhere there. A profile deleted there by hand still loses its words (`private.messages_touch`, H42). The roadmap's account-deletion item says what that project must carry, including the local `activate_deletion_intent`, which writes chat lines and keeps messages.
- **Outbox retention** (K-N11). Chat writes one notice per recipient per message. A cleanup of delivered rows is on the roadmap's later list.
- **A claim whose answer is lost** (pre-existing). A claim marks its jobs `sending`. If its answer never reaches the sender (the 10-second call timeout, `supabase/functions/_shared/notification-adapters.ts:78`), up to 25 jobs stay `sending` until their two-minute lease ends, then turn `unknown`, never sent. `deferred` cannot help: the sender never learned their ids. The loop now claims several times a run, so the exposure is a little wider.
- **The pinned card's jump can land short** (SR10; a chat core issue under H35 I1's "nothing pulls the list back"). In a long chat, when the rows above the announcement are measured late, the jump can leave it just above the screen: 2 of 14 runs on Expo web. Not fixed here; step 7 checks it on the phone. The browser script's own check taps the card again, so it no longer hides the safety scenarios.
- **Chat groups' gaps** (plan 2), accepted:
  - **A leaver after the end can't be re-invited until the roll** (Decision 2). `invite_contacts` refuses on an ended occurrence before it looks at anyone, so the leave stays and the roll skips them.
  - **My resbites' dot can sit on an older tile** until the list refreshes (P2-Q4, Decision 10).
  - **A cancelled last occurrence reads as the last one** (challenge NOTE 7). After "Cancel this and stop repeating", or for an owner who can no longer use the app, the header reads "Last one · Thu 27 Nov · N in the group" for a cancelled occurrence, and the closed card says chats close "48 hours after the resbite". Not worded apart.
  - **A not-answered group member has no Mute this resbite on the resbite page** (challenge NOTE 5, not built): More gives them only Leave this group. Mute chat, in the chat's menu, is theirs.
  - **A message still "Sending…" when its author leaves stays queued** (challenge NOTE 9, not built), and is sent if they are back in the group within the hour.
  - **The plan row's `place_label` stays readable to a not-answered invitee** through `plan_read`, as since GI1 (Decision 11's limit). The chat no longer hands it over.
  - **Two simultaneous account deletions can still deadlock** when each owns a group stopped by Edit with a future occurrence and each wrote in the other's chat (the plan loop writes the stop time before the ordered pass). `request_account_deletion` is local only; the request that fails can be retried. The fix goes with the account-deletion lifecycle: take every chat row in one sorted pass first.
  - **A group whose owner is gone can stay open past 48 hours** (ruling GR4 M-1). When an owner's account deletion cancels a future occurrence and keeps the rule, or an owner cancels "just this one" and then loses access, the chat stays open, and pushing, until that cancelled occurrence's end + 48 hours, which can be about two weeks for a fortnightly group. The deletion is local only today; the fix goes with the account-deletion lifecycle and the sorted pass above: the deletion writes the group's stop time when it cancels.
  - **A leave is not carried by a fold** (ruling GR4 M-4). A person who left a group with an app account that had no confirmed number, while their web account, invited by number, still has a row on the current occurrence, is back in the group when they add the number and the fold moves that row. Narrow, and consistent with "any way back in clears a leave"; recorded only.
  - **A closed group isn't resumed** (ruling GR3 Q1). The roll never reopens it, and the app's Edit can't reopen an ended occurrence, so the way back is the closed card's "Do this again", a new resbite.
- **Chat safety's gaps** (plan 3), accepted:
  - **A team removal on an older build.** A message the team removed reads "Message removed by an admin" on a build without plan 3, as after a rollback.
  - **A second phone keeps the blocked person's rows for a while** (B3, Decision 17). The "blocks changed" event is one phone's. Another phone signed in to the same account, with that chat open, keeps the rows until its next full read: a refocus, the return to the app, or a reopen.
  - **Pushes already shown stay** (challenge N14 (e)). A block stops new pushes from the blocked person; those already in Notification Center stay until they are cleared or the person signs out.
  - **What G-S13's default still lets through** (challenge N12). A co-host or a guest of the blocked person can invite the blocker to the blocked person's resbite, since that notice's actor is not blocked. And the `'link'` answer asks the blocked person to send the blocker a link outside Resbite.
  - **A fold and an old connection** (I4). A fold moves a block to the app account, but a connection the app account already had with the blocker stays.
  - **The inviter rests on kept notices** (B4). Who invited an unanswered invitee is read from the outbox's `invited` rows, which are kept today (K-N11). The roadmap's cleanup of delivered rows must keep an unanswered invitation's `invited` row.
  - **A message report refused because the message is no longer sent** says "You can’t report that any more." with no way on from that sheet (challenge N7, listed, not taken). The person's name in the chat still opens Report <name>.
  - **The owner stays offered after a block** (I-2). On the invitation card and the resbite page the owner comes from the plan, not the overview, so Report and Block for them stay after a block. Blocking again changes nothing.
  - **Plan 2's parked deadlock stays** as plan 2's gaps record it (ruling GR2): two account deletions at once can deadlock when each owns a group stopped by Edit and each wrote in the other's chat. Plan 3's deletion copy adds no chat-row lock.
  - **A removed guest can't report the host who removed them** (the final review's M6). A guest a host removed is out of the chat, and in no audience, so `report_message` and `report_user` answer `22023 'Report unavailable'` (a group's leaver is covered by the leave record; a removal is not). The support address covers it (App Store 1.2).
  - **Deleting two profiles by hand at the same moment** that blocked each other can deadlock on the blocks' cascades, as refusals already can (pre-existing). Delete profiles by hand one at a time; the one that fails can be retried.
  - **A block undone before the daily read** isn't seen by the team (`open-reports.sql` lists the blocks that stand). An undone block is the person's own retraction.
  - **A report whose reporter goes before the read** is gone with them (CH-P18), and the moderator's push then finds nothing in the queue.
  - **`block_user`'s answer for a repeat** (the final re-review's note). Blocking again someone the caller can no longer read answers `stored` false, though the earlier block row stays. Harmless: the app takes the blocks from `my_blocks`, and the answer reveals only the caller's own data.
  - **`accept_chat_rules` without a profile** raises a raw `23503` naming the caller's own id. Nobody without a profile can be in a chat, so the app never meets it.
- **Sign-out and the pushes left on the phone: fixed (H39).** Sign-out now clears every Resbite push from Notification Center: `plan_update`, chat, connection and, since plan 3, a moderator's report push (`dismissShownPushes`, `mobile/src/services/pushDevice.ts:349`; `PUSH_TYPES`, `mobile/src/services/pushRegistration.ts:167`). So a chat push's words no longer stay for whoever signs in next.

## Not done here

No hosted change, no function deployment, no Realtime setting, no schedule change, no SQL editor run, no EAS variable, no TestFlight upload and no App Store Connect entry, for chat core, chat groups or chat safety. Nothing was pushed.
