# Groups and chat

**Date:** 10 November 2026. **Status:** approved by the owner on 10 November 2026 after the builder check and the mockup review.
**Builds on:** `main` at `8958fef` and the companion design `2026-11-10-connections-and-circles-design.md` (built first; this one needs only its block hook, CO-P14, and nothing else).
**Figma:** file `DTOeOkGCdYWf0e4vlD2j8y`, page "↳ CH · Resbite chat". The spec is **CH · Dev brief: Resbite chat V0.6** (node `475:4779`, Stephen's requests of 16 October 2026), the flow **CH · Resbite chat: flow V0.5** (`475:4855`, lanes A to E) and the greyscale wireframes **CH · Resbite chat: wireframes V0.5** (`557:102`, screens CH-01 to CH-08). **OM · Dev brief: Resbite object map V0.3** (`473:2221`) names the objects. Where this document and the brief differ, this document wins; each difference is an owner decision below.
**Mockups (10 Nov):** `docs/superpowers/specs/2026-11-10-connections-groups-chat-mockups/group-chat.html`, checked by the owner: the group chat as a member sees it, the owner's view with the announcement sheet, and a one-off in its last 48 hours. The Chat row on the resbite page is in `circle-of-trust.html`, phone 2.

## Intent

Every resbite gets a conversation, so the people going can sort out the plan without leaving Resbite, and so Resbite can notify the phone when it matters (Stephen, 12 Oct: "a silent chat is the worst case"). A one-off resbite's chat lives with the resbite: it opens when the resbite is created and goes read-only 48 hours after the end time, because Resbite is a way to meet in real life, not another messaging app.

A **group** is a repeating resbite raised to something that lasts: the Thursday crew. Its chat keeps its history from one Thursday to the next, everyone in the group is in it whatever they answered this week, and each occurrence can land somewhere else without that being a new thing. The owner decided this on 10 November 2026; the brief had parked "one conversation that carries across different resbites of the same group" for later, and the September milestone had ruled out a persistent group chat. Both are superseded.

Messages are stored on Resbite's server under the same access rules as the rest of the resbite, not end-to-end encrypted, so that a late joiner sees the history, an admin can remove a message, and a report can carry the message to the Resbite team. The privacy notice says so plainly.

**Success**
- Ana creates Board game night, every Thursday. The chat exists at once; she writes "Bring your own game if you have one" and nobody is there yet to read it. Leo says Going and sees that message. Mia says Maybe and sees it too. Tom hasn't answered and sees nothing.
- Thursday passes. The next occurrence appears; the chat shows "Board game night ended" and "Next one: Thu 20 Nov · Ana's flat" and carries on. Sol says Can't go this week and still reads everything; the line "Sol can't make it this week" appears.
- Ana taps Announce, picks "Everyone in the group", writes "Doors open at 19:30". Nine phones buzz once. Leo mutes the chat and still gets announcements and changes.
- Pedro's picnic ends on Saturday at 18:00. The line at the top says the chat closes Monday at 18:00. On Monday evening the field is gone, the history stays, and Pedro sees Do this again.
- Someone posts something ugly. Mia reports the message, blocks the person, and stops seeing their messages; the report is in the team's queue.

## Owner decisions (10 November 2026)

| # | Decision |
|---|---|
| CH-D1 | **A group is a repeating resbite** ("every Thursday"), the series the creating-a-resbite build already makes. Creating a group is choosing Repeats on the When sheet; there is no separate "new group" screen or object. |
| CH-D2 | **One chat per group, with history across occurrences.** The conversation belongs to the series and carries from one occurrence to the next, with new locations and all. A one-off resbite has a chat of its own that lives and dies with it. |
| CH-D3 | **Everyone in the group is in the group chat, regardless of this week's reply.** Going, Maybe, Can't go and not yet answered all read and write. The brief's "only people going" rule (Stephen's WhatsApp complaint) keeps applying to one-off resbites. |
| CH-D4 | **The chat closes 48 hours after the end time**, not 7 days. This replaces Stephen's 16 October request, the brief's rule 9 and the When sheet's line "The chat closes 7 days after the end time." The owner chose 48 hours knowing all three. |
| CH-D5 | **Messages live on the server, under access rules, not end-to-end encrypted.** The owner chose history for late joiners, removal by admins and reports with content over the Code of Ethics' end-to-end commitment ("Build it your way"). |
| CH-D6 | The group-chat mockups of 10 November are the design of the screens, on top of the CH wireframes. |

## Calls made while writing (the owner checks these)

| # | Call |
|---|---|
| CH-P1 | **The chat's identity is the series.** Every plan has a `series_id` (a one-off is its own series), so "one chat per series" covers both cases with one rule. A series **becomes a group the first time a repeat rule is set on it** (at creation or on Edit) and **stays a group** even if the rule is later removed or the series is stopped: the flag is stored, not computed, so nobody loses a chat they were in because the host changed their mind before the first Thursday, and "Cancel this and stop repeating" on a first occurrence still gets the group's 48-hour goodbye (CH-P15). A one-off made with "Do this again" is a new series with a new chat; the brief's "link the previous chat" option is not built (the owner can ask for it later). |
| CH-P2 | **Who is in the chat.** One-off: the owner, the admins, and people who are Going or Maybe (Maybe joins the brief's "going", because Maybe people already get reminders and changes, CR-P12). Invited and not answered: not in, as the brief says; Can't go: not in. Group: the owner, the admins, and everyone with an attendee row on the current occurrence, whatever the reply (Going, Maybe, Can't go, not answered), minus people the host removed (their row is deleted) and people who left (CH-P4). People invited by personal link who haven't answered are not in either kind (they have no account yet). |
| CH-P3 | **Joining and leaving a one-off's chat follows the reply.** Going or Maybe: in, with the whole history. Can't go: out, with the line "Sol can't make it"; back in on Going again. Removed by a host: out at once. In a group the reply only produces the line ("Sol can't make it this week"); membership changes only by removal or by **Leave group**. |
| CH-P4 | **Leave group** is new (CR-P24 left "a guest can't leave a series" open). It sits in the chat's menu and in the resbite's More sheet on a repeating resbite ("Leave this group"), asks "Leave Board game night? You'll stop getting its Thursdays and its chat.", records the leave for the series, deletes the person's attendee row on the current occurrence (so the chat, the people list and the roll all stop seeing them), writes "Sol left the group" in the chat, and tells nobody by push. Inviting them again (host or circle) clears the leave. The owner and admins can't leave; an admin steps down first ("Change my reply" to Can't go ends the admin role, CR-P15, then Leave group). One-offs have no Leave: Can't go is the way out. |
| CH-P5 | **Message kinds:** `message` (a person), `announcement` (owner or admin, with an audience) and `system` (Resbite). System lines, from the brief's CH-08 plus the group ones: joined ("Mia joined", or "Clara joined · brought by Pedro"), can't make it, left the group, new admin, time or place changed (bordered chip, tap opens the resbite), cancelled ("Ana cancelled the resbite" / "Ana cancelled this Thursday"), ended ("Board game night ended"), next occurrence ("Next one: Thu 20 Nov · Ana's flat"), removed message. Written by the same server functions that write the outbox today, so they can't drift from what happened. |
| CH-P6 | **Announcements.** Owner and admins only, from Announce above the field. Audience on a one-off: Going (Going and Maybe; default) or Everyone invited (adds people invited in the app who haven't answered, who see it on their invitation card in My resbites and get the push). Audience in a group: Everyone in the group (default) or Going this week. The latest announcement is pinned under the header until a newer one replaces it; tapping it scrolls to it; no unpin in this build. |
| CH-P7 | **Pushes.** A new message: to the chat's members except the author, minus people who muted the chat or the resbite, minus anyone who blocked the author. Body: "Leo: I can bring the snacks" with the text cut at 120 characters, title the resbite's title. To keep a lively chat from buzzing nine phones every few seconds, **at most one push per person per series per minute**: the first message in a minute is pushed with its text; the later ones in that minute are not pushed at all (the person opens the chat and finds them; the dot marks them unread). An announcement: to its audience, "Announcement from Ana: Doors open at 19:30", always pushed. No push for system lines beyond the ones that exist today (changes, cancellation, invited again), none for "closing soon", none to come back. No iOS thread grouping: Expo's push service has no field for it, and it isn't worth a delivery change. Tapping opens the chat. |
| CH-P8 | **Two mutes.** "Mute this resbite" (exists, per series, `plan_mutes`) silences everything about the resbite, chat included. The chat's own **Mute chat** silences messages only; announcements, changes and cancellations still arrive, as the brief wants. New table, same shape. |
| CH-P9 | **Unread:** a per-person "last read" per series; a neutral dot (no number) on the Chat row and on the My resbites tile; the Chat row shows the latest line ("Leo: I can bring the snacks", or the system line). Opening the chat marks it read. |
| CH-P10 | **Transport.** Supabase Realtime, the way Supabase documents it today: broadcast from the database on a **private channel per series** (`chat:<series_id>`), authorised by a row-level policy on `realtime.messages` that lets a member listen. The broadcast carries only a signal (the new message's id and kind), never the body; the app then fetches what it may read through the normal authorised call. That keeps bodies out of the realtime tables, makes a removed person's open subscription harmless (their next fetch returns nothing), and follows the September milestone's rule "private change signals, then authorised reads". "Allow public access" is switched off in the project's Realtime settings (owner, dashboard, approval). Without a live connection the app falls back to what it does everywhere: refetch on foreground and after sending, plus a 20-second poll while the chat screen is open. |
| CH-P11 | **Writing.** Text only, 1 to 1,000 characters, trimmed; no images, voice or files (brief, For later). Links are shown as text and open in the browser on tap after the usual confirm; phone numbers are not auto-linked. Offline: the message is kept on the phone with a client id, shown as "Sending…", retried when back online, and "Not sent. Tap to retry." after failure; the server ignores a repeat of the same client id, so a retry never doubles. Limit of 30 messages per minute per person (22023 "Slow down"). |
| CH-P12 | **Delete and remove.** Anyone deletes their own message ("Message deleted"); the owner and admins remove anyone's ("Message removed by an admin"). Both keep the row and drop the body. The brief's "transfer ownership" is still out (CR design, AG flow). |
| CH-P13 | **Report and block ship with the chat**, because Apple's User Generated Content rule (1.2) requires a way to report, a way to block, and published contact details before a chat can be in the App Store. Report: from a message's long-press or a person's sheet, a sheet with a reason (Harassment · Spam · Not appropriate · Something else) and an optional line; stored for the Resbite team with the message's text frozen at report time; the reporter sees "Thanks. The Resbite team will look at it." and keeps using the chat. Block: from a person's sheet; hides that person's messages from the blocker everywhere, ends their connection and refuses new ones (CO-P14), and stops pushes about their messages; the blocked person is not told and stays on the resbite (the host decides removal). "Report this resbite" (CR-D11) is not in this build. The team's side: `supabase/ops/open-reports.sql` lists open reports; the owner reviews them and marks them handled from the SQL editor; the support address goes on the Data & privacy screen and the App Store listing. |
| CH-P14 | **The Chat row** sits on the resbite page right after the people row (and after "Bring someone" when shown), as wireframe CH-01 and the mockup place it, not at the end where CR-D7 reserved it. It shows the latest line and the unread dot; a person who is not in the chat sees no row (one-off: not answered or Can't go). After a one-off closes the row stays and says "Chat closed · 23 messages". Every occurrence of a group shows the same row, opening the same chat. |
| CH-P15 | **Closing.** A one-off: `ends_at + 48 h`, computed, never stored; cancelled: read-only at once, as the brief says. A group (sticky, CH-P1): never closes while the series runs (the next occurrence is created when the previous ends, CR-P22). When the series stops ("Doesn't repeat" on Edit, or "Cancel this and stop repeating", even on a first occurrence), the chat goes read-only 48 hours after the last occurrence's end, or 48 hours after the cancellation, so the crew can say goodbye. The line at the top appears only once a closing time exists: "This chat closes Mon 17 Nov at 18:00, in 31 hours. Any final words?" and, under two hours, "closes in 50 minutes". No animation; it refreshes each minute. |
| CH-P16 | **The When sheet's line becomes "The chat closes 48 hours after the end time."** (`PLAN_COPY.chatCloses`), in this build. |
| CH-P17 | **The chat is the moment to ask for notifications** if the person never answered the system prompt: the existing ask card, once, on first open of a chat. |
| CH-P18 | **Right to vanish.** Deleting an account deletes the person's messages (body gone, "Message deleted" stays), their reads, mutes, blocks and reports as reporter; reports about them stay with the frozen text. |
| CH-P19 | **People in this chat / this group** opens the existing people list (`/guests`), which already shows who is who. |
| CH-P20 | **A shipped bug the roll has, fixed here.** In the live build a guest who was Going and taps Can't go is stored as `withdrawn`, and `roll_repeating_plans` carries only rows that are not `withdrawn`, so that guest is silently dropped from the series at the next roll. CR-P24 promised the opposite ("Can't go this week may go next week") and CH-D3 depends on it. The roll now carries every attendee row of the current occurrence (removed guests have no row; people who left are skipped through the leave record of CH-P4). Nothing else about `withdrawn` changes: an admin who says Can't go still stops being an admin (CR-P15), and the counts still show them under Can't go. |
| CH-P21 | **A group member sees the people list whatever their reply.** Today names are shown only to hosts and to people who answered (UX2-D6). After every roll all members are "not answered" again, so a member could read the whole chat with everyone's first name yet be refused the people list, Report or block, Connect and the authors' avatars. The rule becomes: on a group, any attendee row grants `can_see_guests` (and with it profile names and avatars); on a one-off, UX2-D6 holds as today. This is the one change to existing policies, and the companion design's CO-P2 follows it. |

## Goals

- A working chat on two phones, with history, pushes, mute, delete, remove, report and block, for one-off resbites and for groups.
- The group behaviour of CH-D1 to CH-D3 on top of the repeating resbites that shipped.
- 48-hour closing everywhere it shows: the When sheet, the chat's line, the closed state (CH-D4).
- Everything hosted arrives as approved migrations, a redeployed sender, one Realtime setting change and a runbook.

## Non-goals (this build)

- Photos, voice notes, files, reactions, replies and threads, mentions, editing a message, read receipts, typing indicators, search, export, pinning by hand, unpinning.
- Direct messages between two people; a conversation that spans different series ("master group"); linking a "Do this again" chat to the old one.
- Chat on the web page; the link site shows nothing of it (CI-P4 keeps details in the app).
- End-to-end encryption (CH-D5).
- "Report this resbite" and ownership transfer (CR-D11, AG flow).
- Android (the brief's Android channel notes wait for the Android build).

## Anti-goals

- Anyone reading a chat they are not in: not through the API, not through realtime, not through a push preview after they were removed.
- A late joiner missing the history (Stephen, 16 Oct); a Can't go person on a one-off still hearing about it; a group member cut off because of this week's reply.
- Nudges: no "closing soon" pushes, no "come back" pushes, no badge numbers.
- Message bodies in logs, in the realtime tables, in reports beyond the one reported, or in a push to someone who muted.
- A chat that outlives its 48 hours, or a group chat that closes while the group still meets.
- Shipping without report, block and a contact address (App Store 1.2).

## Constraints

- Hosted changes only with the owner's approval by migration file name and sha256; no `db push`; rollback files; hosted-baseline replay; runbook under `qa/`; the sender redeploy and the Realtime setting change are listed in the runbook as owner-approved steps.
- Expo SDK 57 (read the v57 docs before any Expo code); the realtime client is `@supabase/supabase-js`'s channel API with `config: { private: true }`.
- House shape for functions, tables and errors (see the companion design's Constraints); pushes through the outbox and sender; UX2-D4 wording except that a chat push carries the message text (CH-P7), which is the point of a chat push.
- Copy in `mobile/src/domain/chatCopy.ts` with its test; browser scripts for the flows; the accessibility rules below.

## The flow

```
Create a resbite ──▶ chat exists (series) ──▶ owner sees "Nobody's going yet" (CH-07)
Guest replies Going/Maybe ──▶ one-off: joins, full history · group: already in from the invitation
Chat row on the resbite (CH-01 place) ──▶ CH-02 chat ──▶ write, push to the others (minus mutes and blocks)
Owner/admin ──▶ Announce (CH-02a) ──▶ CH-03 audience ──▶ card in the chat, pinned, push to the audience
••• ──▶ CH-04 menu: People · Mute chat · Report or block · Leave group (groups, members)
Long-press a message ──▶ Delete (own) · Remove (hosts) · Report
Resbite ends ──▶ one-off: CH-05 line counts 48 h ──▶ CH-06 closed, Do this again for hosts
            └─▶ group: "ended" line, next occurrence created, "Next one" line, chat continues
Series stopped ──▶ group chat counts 48 h from the last end ──▶ closed
Cancelled ──▶ one-off: read-only at once · group "just this one": line, continues · "stop repeating": 48 h then closed
```

## Screens

The CH wireframes (`557:102`) set the layout; the mockup adapts them to the app's kit and to groups. Differences from the wireframes are named.

### CH-01 The Chat row (resbite page; mockup `circle-of-trust.html`, phone 2)

A row card after the people row: speech-bubble icon, "Chat", the latest line in the muted style ("Leo: I can bring the snacks" / "Ana changed the place" / "No messages yet"), a neutral dot on the right when unread, chevron. On a group the first line reads "Group chat". Closed: "Chat closed · 23 messages", no dot. Not shown to people outside the chat.

### CH-02 The chat (mockup `group-chat.html`, phone 1; wireframe `557:150`)

Full screen. Header: Back, title, a second line "Fri 30 Oct · 6 going" (one-off), "Every Thursday · 9 in the group" (group), "Ended · Sat 15 Nov · 7 going" after the end, and the ••• button. Under it the pinned announcement when there is one (label "PINNED", first line, chevron; tap scrolls to it). Under that the closing line when a closing time exists (CH-P15). Then the feed, newest at the bottom, with date separators; people's messages as bubbles with the first name above (yours on the right, tinted); system lines centred and plain; change lines as bordered chips; announcements as tinted cards with "ANNOUNCEMENT · TO GOING" / "TO EVERYONE IN THE GROUP" in words; deleted and removed messages in italics without content. Above the field a line in words: "To: people going. People who join later can read this too." (one-off) / "To: everyone in the group, now and later" (group); owners and admins see the **Announce** pill at the right of that line. The field "Message" and a round send button. Long-press on a message opens the sheet: Delete (own), Remove (owner and admins), Report; on a person's name: Report or block (and Connect, from the companion design, when it applies).

### CH-02a The owner's view (mockup phone 2, under the sheet; wireframe `574:128`)

Same screen with Announce. The owner's and admins' ordinary messages are ordinary bubbles.

### CH-03 New announcement (mockup phone 2; wireframe `557:190`)

Grabber sheet: "New announcement", "Who gets it" with two radio rows and live counts (one-off: "Going · 6" / "Everyone invited · 9"; group: "Everyone in the group · 9" / "Going this Thursday · 6"), a text field "Write an update for your guests" / "for the group", **Send announcement**, Cancel. The sheet is the one place that can send an announcement; it closes on send and the card appears pinned.

### CH-04 The menu (mockup phone 1; wireframe `557:221`)

Anchored to •••: **People in this chat · 6** (group: "People in this group · 9"), **Mute chat** with the sub-line "Changes and announcements still arrive" (toggles to Unmute chat), **Report or block** (opens the people list in a "choose a person" state, or, simpler, a sheet listing the people in the chat with a Report and a Block action each; builder's choice, the second is recommended), and on a group for a member, **Leave group** in red. Tapping outside closes it.

### CH-05 After the end, open (mockup phone 3; wireframe `557:250`)

The closing line at the top ("This chat closes Mon 17 Nov at 18:00, in 31 hours. Any final words?"), the feed, the field. The owner and admins still see Announce. Invite and the people-list actions follow CR-D14 (closed after the end).

### CH-06 Closed (wireframe `557:284`)

No field. In its place a card: "This chat closed on Mon 17 Nov." and "Resbite chats close 48 hours after the resbite, so the plan stays offline. You can still read everything here." Owner and admins get **Do this again** under it. Cancelled one-off: "This chat is read-only because the resbite was cancelled." Stopped group: "This group's chat closed on Thu 27 Nov." with the same second line.

### CH-07 Nobody going yet (wireframe `557:316`)

Owner's and admins' empty state: "Nobody's going yet" and "Messages here reach everyone going. Invite people to get started." with an **Invite people** pill; on a group where the owner is alone: "Messages here reach everyone in the group." Announce is available.

### CH-08 Message types (wireframe `574:261`)

Reference for the builder; the styles above. Each kind is told apart by shape and words, never by colour alone, and the screen reader says the kind.

### The announcement on the invitation card (new)

In My resbites, a person invited in the app who hasn't answered sees the latest announcement sent to "Everyone invited" on their invitation card, under the title: "Announcement from Ana · Doors open at 19:30". Tapping the card opens the resbite as today.

## Rules that cut across screens

1. **Membership is computed, never stored** (CH-P2): one server function decides, and every read, write, push and realtime policy calls it. The only stored facts are the group flag (CH-P1) and the leaves (CH-P4).
1a. **A group member sees the group** (CH-P21): the people list, names and avatars, whatever this week's reply.
2. **The whole history, always.** Anyone in the chat reads it from the first message. The field's line says so.
3. **One chat per series.** Past occurrences of a group open the same chat; "Do this again" starts a new series with a new chat.
4. **Closing is from the end time, 48 hours** (CH-D4). Groups don't close while they run (CH-P15). After closing, reading only; Do this again for hosts.
5. **Pushes only when essential**, and the chat message is essential because people chose to be in the chat; the one-per-minute rule and both mutes keep it bearable (CH-P7, CH-P8).
6. **Safety is always within reach:** report and block from any message and any person; delete your own; hosts remove.
7. **System lines come from the server**, written in the same transaction as the event they describe (reply, change, cancel, roll, leave, join, admin), so the chat never says something the resbite doesn't.
8. **Names:** first names only in system lines and pushes.
9. **Accessibility:** each message is read as author, text, time; system lines as "Resbite: Sol can't make it"; the audience of an announcement in words; the countdown static, refreshed, respecting Reduce Motion; targets 44 pt; the field grows with text; the feed follows the phone's text size.
10. **The end is the boundary** for the resbite's actions (CR-D14); the chat's boundary is its own closing time.

## Data

**Tables**

- `public.messages (id bigint generated always as identity primary key, series_id uuid not null, plan_id uuid not null references plans on delete cascade, author_id uuid null references profiles on delete set null, kind text not null check (kind in ('message','announcement','system')), audience text null check (audience in ('going','everyone')), event text null, payload jsonb null, body text null check (body is null or length(body) between 1 and 1000), client_id uuid null, state text not null default 'sent' check (state in ('sent','deleted','removed')), created_at timestamptz not null default now(), unique (author_id, client_id))`. `plan_id` is the occurrence current when the message was written (for "Sat 15 Nov" grouping and cascade); `series_id` is the chat. Index `(series_id, id)`. RLS: select where `private.chat_member(series_id, auth.uid())` and not blocked (`author_id` not in the caller's blocks); no insert, update or delete policies.
- `public.chats (series_id uuid primary key, is_group boolean not null default false, last_message_id bigint null, last_message_at timestamptz null, pinned_message_id bigint null, message_count int not null default 0)`, the row created with the plan (and for every existing series by the migration, `is_group` true where any occurrence has or had a repeat rule), `is_group` set to true by `create_plan_v4` and `change_plan_v4` when a repeat rule is set and never set back (CH-P1), the rest kept by a trigger on `messages`; RLS select for members.
- `private.series_leaves (series_id uuid, user_id uuid, left_at timestamptz, primary key (series_id, user_id))` (CH-P4); cleared by `invite_contacts` when the person is invited again.
- `public.chat_reads (series_id uuid, user_id uuid, last_read_id bigint not null, primary key (series_id, user_id))`, RLS own rows.
- `public.chat_mutes (series_id uuid, user_id uuid, muted_at timestamptz, primary key (series_id, user_id))`, RLS own rows (CH-P8).
- `private.blocks (blocker_id uuid, blocked_id uuid, created_at timestamptz, primary key (blocker_id, blocked_id))`, cascade on deletion.
- `private.reports (id bigint identity, reporter_id uuid null, target_user_id uuid null, message_id bigint null, series_id uuid null, plan_id uuid null, reason text check (reason in ('harassment','spam','inappropriate','other')), details text null check (length(details) <= 500), frozen_body text null, frozen_author uuid null, created_at timestamptz, status text not null default 'open' check (status in ('open','reviewed','actioned')), reviewed_at timestamptz null)`.
- `private.notification_outbox`: `kind` check gains `chat_message` and `announcement`; new column `message_id bigint null references public.messages on delete cascade`; the one-per-minute rule of CH-P7 is applied at claim time: a `chat_message` row for a recipient who was sent one for the same series in the last 60 seconds is marked delivered without a send.

**Functions** (`private.x` + `public.x` wrappers, grants to `authenticated`)

- `private.chat_member(p_series uuid, p_user uuid) returns boolean` (CH-P2), using the series' current occurrence (the one with no `repeats_from` successor), `private.is_host`, `chats.is_group` and `series_leaves`.
- `private.chat_closes_at(p_series uuid) returns timestamptz` (CH-P15) and `private.chat_open(p_series uuid)`.
- `private.can_see_guests(p_plan, p_user)`: also true when the plan's series is a group and the user has an attendee row on it (CH-P21); `can_read_profile` and the avatar storage policy follow through it unchanged.
- `private.roll_repeating_plans()`: carries every attendee row (CH-P20) except people in `series_leaves`; writes the "ended" and "Next one" lines.
- `leave_series(p_series uuid)`: member who is not a host; inserts the leave, deletes the attendee row on the current occurrence, writes the system line, no outbox.
- `chat_summary(p_series uuid)`: membership, is_group, closes_at, pinned message, counts for the header and for the announcement sheet, the caller's mute states, unread flag; 42501 when not a member.
- `chat_messages(p_series uuid, p_before bigint null, p_limit int default 50)` and `chat_messages_since(p_series uuid, p_after bigint)`: pages of messages with the author's first name and avatar, blocked authors filtered out; both check membership.
- `send_message(p_series uuid, p_body text, p_client_id uuid)`: member, chat open, rate limit, insert, outbox rows for members except the author, minus `plan_mutes`, `chat_mutes` and blockers of the author; returns the row; a repeated `client_id` returns the existing row.
- `send_announcement(p_series uuid, p_body text, p_audience text)`: host, chat open; insert; `chats.pinned_message_id`; outbox `announcement` to the audience (`going`: accepted and maybe on the current occurrence; `everyone`: plus pending; group default everyone-in-group is the `everyone` audience, group "going this week" is `going`).
- `delete_message(p_id)`, `remove_message(p_id)`: author / host; set state and null the body; a removed pinned announcement unpins.
- `mark_chat_read(p_series, p_last_id)`, `set_chat_mute(p_series, bool)`.
- `block_user(p_user uuid, p_block boolean)`: insert or delete the block; delete any `connections` row between the two and insert a refusal that outlives plans (a `plan_id`-less refusal, or a check in `request_connection` against `blocks`; builder's choice, the check is simpler).
- `report_message(p_id, p_reason, p_details)`, `report_user(p_user, p_series, p_reason, p_details)`: insert with the frozen text; 22023 when the reporter can't read the message.
- System lines: `respond` (joined / can't make it, one-off vs group wording), `remove_guest` (nothing), `appoint_admin` ("Leo is now an admin"), `change_plan_v4` (time/place chip with `payload` holding the new values; cancelled), the roll ("ended" on the old occurrence, "Next one" with the new date and place label), `leave_series`, `answer_phone_invitation`/`claim_invite`/`invite_contacts` for groups ("Clara joined · brought by Pedro" when the person is added to a group; on a one-off "joined" comes with Going).
- `notification_recipient_eligible`: `chat_message` and `announcement` branches (member at send time and at claim time; both mutes; blocks; the 24-hour age rule stays); returns `message_id` and the message body for the copy.
- The realtime trigger: after insert or update on `messages`, `realtime.send(jsonb_build_object('id', new.id, 'kind', new.kind, 'state', new.state), 'chat', 'chat:' || new.series_id::text, true)`. Policy on `realtime.messages` for select: `realtime.topic() like 'chat:%' and private.chat_member(substring(realtime.topic() from 6)::uuid, auth.uid())`; no insert policy. The Realtime setting "Allow public access" off (runbook step, owner).
- Account deletion lifecycle: messages (body null, state deleted, author null), reads, mutes, blocks, own reports.
- `my_invitations` / the My resbites query: the latest `everyone` announcement for pending invitees.

**Sender** (`supabase/functions/`)

- `notification-copy.ts`: `chat_message` ("<first name>: <body cut at 120>"), `announcement` ("Announcement from <first name>: <body cut at 120>"). Payload `data.type = "chat"`, `seriesId`, `planId`. Mutes, blocks and the one-per-minute rule are decided in the claim, not here.

**App**

- `app/chat.tsx` (`/chat?series=`), `mobile/src/state/useChat.ts` (summary, pages, realtime channel `chat:<series>` with `private: true`, the 20-second poll while focused, foreground refetch, send queue), `mobile/src/services/chat.ts` (RPCs), `mobile/src/services/chatQueue.ts` (unsent messages with client ids, per account), `mobile/src/domain/chatCopy.ts` and `chatRules.ts` (closing text, grouping by day, who sees Announce, membership-independent rendering of kinds) with tests.
- `app/event.tsx` and `eventPage.ts`: the Chat row and its states; "Leave this group" in More for members of a group.
- `(tabs)/plans.tsx`: the unread dot on tiles, the announcement line on invitation cards.
- `app/guests.tsx`: Report or block in a person's sheet; the "People in this chat" entry.
- `pushTaps.ts`, `pushRoute.ts`: `type: "chat"` → `/chat?series=` after the authorised summary read.
- `data-privacy.tsx`: the support address and a line about where messages are stored (CH-D5).
- `mobile/src/domain/planCopy.ts`: `chatCloses` → 48 hours (CH-P16).
- `supabase/ops/open-reports.sql` and a short `supabase/ops/README` note on reviewing reports.

**Tests**

- SQL (`supabase/tests/chat.sql`): membership matrix for one-offs (pending/accepted/maybe/declined/withdrawn, owner, admin, removed) and groups (every reply in, left out, removed out); the group flag staying after "Doesn't repeat" and after "Cancel this and stop repeating" on a first occurrence; the roll carrying a `withdrawn` guest and skipping a leaver (CH-P20, CH-P4); `can_see_guests` for a pending group member and not for a pending one-off invitee (CH-P21); `chat_closes_at` for a one-off, a running series, a stopped series and a cancelled one; send refused when closed, when not a member, over the rate limit; the client-id repeat; announcements' audiences and the pin; delete and remove; the outbox fan-out with both mutes and a block; the realtime policy with a member and a non-member; system lines written by respond, change, cancel, roll and leave; deletion leaving "Message deleted"; reports freezing text.
- Edge: `notification-copy.test.ts` for the two kinds and the cut; SQL for the claim's one-per-minute rule (second message within 60 s not sent, first after 60 s sent).
- Mobile unit tests: `chatCopy`, `chatRules` (closing line wording, day grouping, Announce visibility, Leave visibility), the queue (retry, no double), `eventPage` for the Chat row states.
- Browser scripts: `verify-chat.mjs` (two accounts: send, receive via a stubbed signal, announce, mute, delete, remove, report, block, leave group) asserting RPC names and arguments; `verify-event.mjs` extended for the row.
- Two-phone acceptance in the runbook: a message arrives within a few seconds with the app open, and as a push with it closed; a muted phone stays quiet; a blocked person's message is not shown; a removed person's open chat stops receiving.

## Left to the builder

- The list component (inverted FlatList or FlashList), the keyboard handling, how the pinned card scrolls to its message.
- The exact mechanics of the one-per-minute rule in the claim function and whether the 20-second poll is needed once realtime proves reliable on the two phones.
- Whether Report or block in the menu lists people in a sheet or routes to the people list (CH-04).
- The migration split (chat core, safety, system lines) and the runbook steps, including the sender redeploy and the Realtime setting.
- Updating `knowledge-base/08-decisions.md` with CH-D1–D6 and CH-P1–P19 and `docs/implementation-status.md` at rollout; the App Store review notes describing report, block and the contact address.

## Open for the owner (not blocking the plan)

- **The support address** to publish on Data & privacy and the App Store listing, and who reads the reports queue and how often. Apple expects "timely" responses.
- Tell Stephen: 48 hours instead of 7 days (CH-D4), everyone in a group is in its chat (CH-D3), messages are server-side (CH-D5), no linked chats for Do this again (CH-P1).
- Message previews in pushes (CH-P7): the text shows on lock screens; the alternative is "Leo sent a message".
- For later: photos, export, a conversation across series, unpin, Android channels.
