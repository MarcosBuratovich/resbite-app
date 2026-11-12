# Groups Implementation Plan (chat plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repeating resbite becomes a group: one chat that carries from week to week, everyone in the group in it whatever this week's reply, a goodbye window when the series stops, a way to leave, and the group's people visible to every member.

**Architecture:** One migration, in two sections, sets plan 1's group flag on `public.chats` and keeps it sticky, and adds a stop time and a leave record per series. It redefines the chat's membership and closing rules, two of plan 1's chat-line trigger functions, `can_see_guests`, `request_connection`, `chat_summary` and the roll for groups, plus plan 1's `chat_row` (no exact place for a member who hasn't answered) and its push eligibility (a group's open chat pushes in a cancelled week). It adds `leave_series`, `series_is_group` and `group_stopped`, and the "ended", "Next one", "left", "stopped repeating" and "made this a group" lines. The roll sets the shared roll flag, so it writes no line for the people it carries. The app learns the group wording, the audiences' labels, the stopped header, Leave group, and names for members who have not answered, with the group flag read as part of the event.

**Tech Stack:** as chat plan 1.

**Spec:** `docs/superpowers/specs/2026-11-10-groups-and-chat-design.md` (CH-D1–D3, CH-P1–P6, P15, P19, P21, rules 1 and 1a). CH-P20 (the roll fix) shipped earlier in the follow-ups plan.

**Branch:** `ch2-groups`, made at `43f4416` (chat core's final head on `ch1-core`), so it is stacked: `co3-follow-ups` → `co2-circles-of-trust` → `ch1-core` → `ch2-groups`. Ships in the same release as plans 1 and 3.

**Tasks:** 4.

## Revised 12 November 2026 (after chat core was built)

Chat core (plan 1) is built and reviewed on `ch1-core` at `43f4416`. Its migration `supabase/migrations/20261111140000_chat_core.sql` has sha256 `1047fb379a4e8a942b49db3f7134674caecf2cbb30f67e0ebf9f0f2fea6a78ce`, and every `chat_core.sql:N` below is a line of that file. This revision brings the plan in line with what was built: the notes chat core left (`.superpowers/sdd/challenges/chat-1-notes-for-plans-2-3.md`, binding), its code, and its ledger's rulings (H1–H43). **Where this plan copies a chat core body to extend it, it copies the body as built at that hash, and its rollback restores that exact body.** Each correction, old → new with the built file and line, is in `.superpowers/sdd/challenges/chat-2-3-after-core.md`. The rulings' Shared interfaces table predates the build: where it and the built code differ, the built code wins (the report lists the rows).

What changed, one line each:
- **Branch:** stacked on `ch1-core` at `43f4416`, not cut from main.
- **Copied bodies (Tasks 1, 2):** `private.chat_member` (`chat_core.sql:132-138`), `chat_closes_at` (:156-159), `chat_open` (:165-168), `private.chat_summary` (:248-274), `attendees_chat_lines()` (:920-952) and `plans_chat_lines()` (:963-980), each as built. After the challenge, also `private.chat_row` (:209-215) and `private.notification_recipient_eligible` (:652-692, already `create or replace` there). Chat core made them with `create function`, so this plan writes `create or replace function`, and the rollback restores each body byte for byte.
- **`chat_summary` (Task 1):** plan 1 already returns `is_group` from `chats.is_group` (:260). Plan 2 changes only `'stopped', false` to `private.group_stopped(p_series)`, and only the private body; `public.chat_summary` stays plan 1's wrapper.
- **The flag check (Global Constraints, Task 2):** it is `private.chat_lines_off()` (:905-907). `private.chat_system_line(p_plan, p_event, p_payload)` (:894-899) sets `actor` to `auth.uid()` unless the payload names one, so the roll passes `'actor', null` itself.
- **SQL order (Task 1):** chat core creates each SQL helper after what its body names (:117-118). `series_leaves` and `group_stopped` come before the redefined `chat_member` and `chat_closes_at`.
- **Coalescing (Task 2):** chat core's merge searches the whole series (:939-943). Its note asks plan 2 to narrow it to the current occurrence; H33's "no later line names them" guard stays. The search also gains `state = 'sent'`, since plan 1 never changed a system line's state and a deleted line must not be merged into.
- **The deleted `cant_go` line (Task 2):** `chat_messages_since` never reports a row removed by SQL `delete` (final review m6), so Decision 6's state change is the way, as written. The line takes no `chat:` advisory lock (:886-889). The `chats` row is locked as `messages_chat_stats` locks it (:407), since that trigger ignores a system row's state change (:400-403).
- **`chat.sql` (Tasks 1, 2):** the plan names the assertions the group flag, the roll's two lines and the way-back block's stand-in table break, by line.
- **`cancelled` payload (Task 2):** `chat.sql:2134-2142` compares the whole payload, so it changes.
- **Rollback (Task 2):** chat core's rollback refuses while `private.series_leaves` exists (`supabase/rollback/20261111140000_chat_core.rollback.sql:44-49`), so dropping that table is what lets it run. The header also says that plan 2's lines stay, and that the restored roll writes `admin` lines again.
- **The way-back block (Task 2):** `chat.sql:2243-2290` creates a stand-in `private.series_leaves`, which fails once the real one exists. It switches on `to_regclass` with `\if`, as circles' slice 17 does for chat.
- **Rehearsal files (Tasks 1, 2):** chat core's `create function` text runs as `create or replace` when bodies are compared. `before.sql` adds no roster row, and `after.sql` deletes its rows, `public.chats` rows by series included (no foreign key to plans), as `20261111140000_chat_core.after.sql:215-219` does.
- **Hosted-baseline runs (Tasks 1, 2, 4):** name all four candidates (follow-ups, circles, chat core, chat groups). Chat core's `after.sql` runs before this migration and needs no change.
- **Test fixtures (Task 2):** an `update` can't set `messages.updated_at` (`messages_touch`, :62-72). A test moves `created_at`, or inserts the row by hand with both, as `chat.sql` does.
- **App, already built (Task 3):**
  - `ChatSummary.repeatWeeks` is already `1 | 2 | null` (`mobile/src/services/chat.ts:43`).
  - `rowText` already takes `group` (`chatRules.ts:253`), and the Chat row already passes `summary.isGroup` (`eventPage.ts:263`).
  - `systemText`'s `ended` with its title fallback (`chatRules.ts:232-235`) and its "joined · brought by" (:219-223) are already built for both kinds.
- **App, widened (Tasks 3, 4):**
  - `messageLabel` takes no group today (`chatRules.ts:423-447`), and calls `systemText(…, false, "")` and `announcementLabel`.
  - `chatFeed` (`mobile/src/state/chatFeed.ts:143-244`) words every line, heading and label with `group` false (:181, :194, :213).
  - Both gain the group and its weekday.
- **App signatures (Task 3):** `headerLine(summary, now)`, `closedCard(summary, now?)`, `dayLabel(iso, zone, now?)` and `withEndedLine(items, summary, hasEarlier, now)`. The screen's `now` is `chat.serverNow()` (`chat.tsx:153`).
- **Copy (Task 3):** `CHAT_COPY` and `systemText` write the apostrophe as ’ (U+2019; `chatRules.ts:225`, `chatCopy.ts:42`, :47), so the new strings do too: "Sol can’t make it this week", "You’re not in this group." and the rest.
- **Leave and `focusedChat` (Task 4):** leaving the chat screen runs its focus cleanup (`chat.tsx:161-170`), which clears `focusedChat()`. Leave group needs no step of its own for the push router (H36).
- **"Next one" (Task 4):** a feed row of its own, drawn like the change chip (`chat.tsx:796-810`) and, like it, opening the summary's current `planId`, never `payload.plan_id` (I5, below), with a new `CHAT_COPY.opensResbite`.
- **Callers (Tasks 3, 4):**
  - `showsNames` and `moreRows` are called in `event.tsx:152` and :166, and in `useEvent.ts:248` and :358; `peopleGroups` in `guests.tsx:122`.
  - `chatOpen` is the Chat row's summary, `event.chat?.open`.
  - `readEvent` is at `rsvp.ts:126`.
- **Chat row (Task 4):** `chatRow` and `chatRowLabel` carry the group, and the open row reads "Group chat". The closed and hidden states stay as built (K-S13).
- **When sheet (Task 4):** `PLAN_COPY.chatCloses` shows for every plan (`WhenSheet.tsx:115`). Chat core's note says it must change for a group. P2-Q2 is ruled: it hides while Repeats is set, with no new copy (Decision 8).
- **`verify-chat.mjs` labels (Task 4):** plan 1 already uses (g), (g2), (g3) and (g4), so this plan's scenarios are (gr1) to (gr9).
- **Runbook (Task 4):** the groups part goes into the sections chat core wrote, with `ch2-apply.sh` and `ch2-rollback.sh` in the `ch1-*.sh` shape. Step 3's `groups 0` becomes the backfill's count, and the Decision 4 lines go.
- **Decisions log (Task 4):** a "Chat groups" section after Chat core's (`knowledge-base/08-decisions.md:622-672`), one line each, and chat core's lines that point to plan 2 updated.
- **Confirmed unchanged by the build:**
  - `private.announcement_audience` is built on `chat_members` (:184-193);
  - `plan_admins_chat_lines` is silenced by the roll flag (:986-993);
  - `chat_names` needs no new key, since no payload here adds a person;
  - `e6` and `e8` are still unused;
  - the migration name `20261111150000_chat_groups` doesn't clash.

**Chat core's four questions, ruled** (`.superpowers/sdd/challenges/chat-2-3-after-core-rulings.md`, binding). They are decisions now, not questions:
- **P2-Q1. Pushes while a group's week is cancelled: push them** (Decision 7). Plan 1's eligibility drops every chat push whose notice's plan is cancelled (`chat_core.sql:685`, H28 and H30, made for one-offs). After "Cancel just this one", or for the 48 hours after "Cancel this and stop repeating", a group's chat is open (CH-P15, CH-R-A2), and its notices sit on the cancelled current occurrence. Task 2 redefines `private.notification_recipient_eligible`, copied as built (:652-692): for a group, the chat branch tests `private.chat_open(msg.series_id)` in place of `plan.status<>'cancelled'`. A one-off keeps plan 1's rule.
- **P2-Q2. The When sheet's line for a repeating plan: hidden while Repeats is set** (Decision 8). No new copy. CH-P15's own rule is that a closing line appears only once a closing time exists, and a running group has none.
- **P2-Q3. A pending group member's announcement line: keep both, as built** (Decision 9). `my_chat_overview` lists the latest announcement for any unanswered row on the current occurrence (`chat_core.sql:351-362`), and `useEvent` reads it for any pending guest (`useEvent.ts:270-271`, `waitingAnswer`). The line is the invitation to this week, and the chat is where the group talks.
- **P2-Q4. My resbites' dot for a group: no server field** (Decision 10). `currentOccurrences` (`chatRules.ts:307-320`) sees only the plans listed on the phone (accepted in H37). The roll lists the new occurrence for members, so the gap is short-lived. The limit is a known gap in the runbook.

### After the challenge (12 November 2026)

From `.superpowers/sdd/challenges/chat-2-groups-after-core-challenge.md` (1 BLOCKING, 11 IMPORTANT, 12 NOTE, 3 owner questions), with the controller's rulings in `chat-2-groups-after-core-rulings.md` and `chat-2-3-after-core-rulings.md`. The rulings win where they differ from the challenge. One line per ruling:
- **B1:** P2-Q1 to Q4 are decisions (above; Decisions 7 to 10). `private.notification_recipient_eligible` is redefined for P2-Q1, with its rollback line, its rehearsal comparison and the slice 2f tests: a cancelled week's group message pushes members, a cancelled one-off pushes nobody, and a stopped group's 48-hour goodbye pushes. Plan 3 copies plan 2's body (its own ruling B2). Task 2; Task 4, Step 5.
- **I1:** the roll's own flag is proved. The test resets the flag before the roll and asserts it is `roll` right after. The concurrency script, whose roll runs in a clean session, checks for no `joined` and no `admin` line. Task 2, Steps 1 and 2.
- **I2:** two tests. A `cant_go` on the old occurrence survives Going on the new one, which pins the merge to the current occurrence. A `cant_go` 11 minutes old survives Going, which pins the 10 minutes. The line changes state, never vanishes unseen (m6), and H33's guard doesn't apply to the delete. Task 2.
- **I3:** My resbites draws the unread dot on a group member's invitation card (`plans.tsx`), checked in `review-ui.mjs` beside the tile's dot. Task 4.
- **I4:** `readEvent` reads a failed `series_is_group` as "not a group" and keeps the page. Tested, with a line in the rollback header and the runbook. Tasks 2, 3 and 4.
- **I5:** every "Next one" line opens the newest occurrence the reader may read, which is the summary's current `planId`. With no `planId` it re-reads the chat instead of opening an error page. Decision 14; Tasks 3 and 4, (gr2).
- **I6:** `leave_series` deletes the `invited:<plan>:<user>` notice with the row, so a re-invite the same week pushes. Task 2.
- **I7:** `attendees_clear_leave` also fires on `update of user_id` (a fold). Task 1.
- **I8 (owner question G-QB, default):** turning the repeat back on deletes the "stopped repeating" line by state, with the `last_message_id` care of Decision 6, through a shared `private.chat_hide_line`. No new words. Decision 12; Task 1.
- **I9 (owner question G-QC = the circles runbook's CO-Q1, still open):** the roll's forward copy is pinned to the circles migration's sha256 `04062e2b…`. Plan 2 depends on CO-Q1 staying "carried". A brought Can't-go guest is tested as carried. Decision 13; Task 2; Task 4, Step 5.
- **I10:** Leave from the resbite page lands on My resbites, with the group gone. Tested online and offline. Task 4.
- **I11 (owner question G-QA, default):** privacy wins, server-side. `private.chat_row` leaves `place_label` out of `next` and `changed` payloads for a reader the resbite page shows only the area to (`placeLine` → `eventPlace`, `eventView.ts:44-53`). That covers `chat_messages`, `chat_messages_since`, `chat_summary.pinned`/`last` and `my_chat_overview`'s `last`. The app words those lines without a place. Decision 11; Tasks 2 and 3.
- **NOTEs taken (they correct the plan's text):** 1 (`chat.sql:211-216` kept), 2 (`dayLabel` without `now` in `systemText`), 3 (`series_is_group` follows membership), 4 (the old replies spelled out), 6 (the Chat row survives an answer on a group), 7 (the cancelled-stop header and card recorded as a known gap), 8 (a roll signed in as someone), 10 (two rollback header lines), 11 (slice 2's cast, blocks and file order), 12 (the small tests; a leave on a closed group is allowed; `stopped_at` only on a group). Tasks 1 to 4.
- **NOTEs listed, not taken (they add scope):** 5 ("Mute this resbite" for a not-answered group member: "Mute chat" in the chat's menu is theirs already) and 9 (dropping a leaver's unsent messages). Both are known gaps in the runbook (Task 4, Step 5).
- **Owner questions:** G-QA (I11), G-QB (I8) and G-QC (= CO-Q1, I9) go in the runbook's Step 0, each with the default the build ships. Task 4, Step 5.

## Revised 11 November 2026

This plan absorbs the rulings in `.superpowers/sdd/challenges/chat-rulings.md` on the findings in `.superpowers/sdd/challenges/groups-and-safety.md`. Plans 1, 2 and 3 share the rulings' "Shared interfaces" table, used here verbatim.

Rulings absorbed, one line each:
- **Shared interfaces:** the roll flag, `private.chat_members`, the trigger function names, `payload.actor`, the `names` map, `ChatSummary` in camelCase and the `chat_closes_at` null rule. Tasks 1, 2 and 3.
- **G-B5:** a guest on a group sees a "Not answered yet" group of the pending app invitees, tested as a guest whose co-members are all pending. Tasks 3 and 4.
- **G-B6:** the roll sets the roll flag, so it writes no `joined` and no `admin` line. Task 2.
- **G-B7:** the backfill sets `stopped_at` for every group whose current occurrence has no rule, cancelled or not. Task 1.
- **G-S1:** a cancel that stops the series overwrites `stopped_at`. Task 1.
- **G-S2:** `cancelled` carries `stop`, words "cancelled this Thursday" or "cancelled the group", and no `ended` follows a cancelled occurrence. Tasks 2 and 3.
- **G-S3:** the group branch of `can_see_guests` needs current membership, with its cost noted. Task 2.
- **G-S4:** an owner who is not `user_eligible` counts as stopped. Task 1.
- **G-S5:** no leave test in `chat_member` while the occurrence runs, `leave_series` locks the occurrence, and a concurrency script. Tasks 1 and 2.
- **G-S6:** `title` in the `ended` payload, and `rowText` takes `group`. Tasks 2 and 3.
- **G-S7:** the three group strings, the group's default audience and order, and the stopped header. Tasks 3 and 4.
- **G-S14 (plan 2 items):** the tests each finding names. Tasks 1 to 4.
- **G-N1:** clear-on-insert stays (Decision 1), and `leave_series` revokes the leaver's personal links. Task 2.
- **G-N2:** superseded by the roll flag. Task 2.
- **G-N3:** the roll nulls a `brought_by` whose bringer is not carried, and the people list falls back to no line. Tasks 2 and 3.
- **G-N4:** `plans_group_flag` acts on the current occurrence only, compares OLD with NEW, and writes by upsert. Task 1.
- **G-N5:** the app decides "closed" only from `open`, and picks the closed card from `(isGroup, stopped, status)`. Tasks 1 and 3.
- **G-N6 (plan 2 items):** `ChatSummary` fields in camelCase. Task 3.
- **G-N7 (plan 2 items):** the "Next one" line is a button, the group header wraps, and a failed Leave stays in its confirm. Task 4.
- **G-N8:** the "made this a group" line. Tasks 1 and 3.
- **G-N11:** rollback in reverse order only, and this plan's rollback header names the lost leaves. Tasks 2 and 4.
- **G-N13:** the "stopped repeating" line, a leave after the end, the two refusals' wording, and `is_group` in the event read. Tasks 1, 2 and 3.

Departures and choices, recorded:
- A leave clears on any attendee insert, not only through `invite_contacts` (spec, Data). Decision 1, from G-N1.
- "Ana made this a group · everyone invited can read this chat" is a new line (G-N8). Decision 3.
- "Ana stopped repeating this · the last one is Thu 27 Nov" is a new line (G-N13). Decision 3.
- A leave after the current occurrence ended keeps the attendee row and ends membership at once. Decision 2, from G-N13 and G-S5.
- The roll writes the `ended` and `next` lines itself. No `plans_group_lines` trigger exists, since only the roll inserts a plan with `repeats_from`.
- A group's "Cancel just this one" keeps the chat open (CH-P15). CH-R-A2 makes this the rule: a null close time on a group means open, and on a one-off means cancelled, so closed. The app reads only `open`.
- `public.plans` holds no cancellation time, so the backfill uses `least(now(), plan_end(current))` for it (G-B7).
- G-S3 narrows CH-P21. The spec lets any attendee row on a group grant `can_see_guests`. Here only a current member's row does, so a leaver or a removed person sees the one-off rule (confirmation NOTE 10).
- The `ended` line reads "Board game night ended", without the mockup's "· 8 came" (`group-chat.html:91`). The spec's text has no count (spec:42), and no count is stored (confirmation NOTE 15).
- A flip back to Going deletes the group's `cant_go` line in place, as `state = 'deleted'`, rather than with `delete`. Open screens then learn of it through the existing signal and `chat_messages_since` (Decision 6).

### Revision 2 (11 November 2026)

From `.superpowers/sdd/challenges/chat-confirmation.md`, adopted by CH-R-A5:
- **CH-R-A2:** the group rule for a null close time is now a ruling. Departures list above.
- **CH-R-A4:** the names shared with plan 1 (`defaultAudience`, `closedCard`, `withEndedLine`, `is_group`, `stopped`) are unchanged.
- **CH-R-A6:** plan 1 creates `chats.is_group` and `private.chat_is_group(p_series)`. Plan 2 adds no `is_group` column and no function of that name. It keeps the backfill and the sticky trigger that set the flag, and `stopped_at` stays its own column. Its rollback resets the flag instead of dropping it. Tasks 1, 2 and 4.
- **S1:** plan 1 builds the audiences on `private.chat_members`. Plan 2 adds the test: a leaver after the end gets no announcement and leaves both counts. Task 2.
- **S3:** on a group, `cant_go` coalesces only into `cant_go`, `joined` is never rewritten, and a flip back to Going or Maybe within 10 minutes deletes the `cant_go` line. Decision 6, Tasks 2, 3 and 4.
- **S4:** a guest's "Not answered yet" group and the circles plan's guest "Invited, not answered yet" group never show one row twice. Tasks 3 and 4.
- **NOTE 2:** plan 1 already declares `isGroup`, `stopped`, `repeatWeeks` and `members`. Plan 2 only fills their server values. Tasks 1 and 3.
- **NOTE 10:** G-S3's narrowing of CH-P21 is recorded. Departures list above.
- **NOTE 12:** test ids use the hex prefixes `e6` (SQL tests) and `e8` (the concurrency script). Emails keep `g2-`. Tasks 1 and 2.
- **NOTE 14:** `announcementLabelGroup(a, day)` for the screen reader on a group. Tasks 3 and 4.
- **NOTE 15:** the `ended` line keeps no count (Departures list above). Decision 2 says a post-end leaver can't be re-invited until the roll.

### Revision 3 (11 November 2026)

From `.superpowers/sdd/challenges/chat-confirmation-2.md`, adopted by CH-R-A7:
- **SHOULD 1:** Step 3 of Task 1 also rewrites plan 1's CH-R-A6 tests. The weekly series now reads `is_group` true, and the hand-set `is_group` block goes. Task 1.
- **CH-R-A8:** the SHOULD 2 edit is dropped; C-R16 makes slice 17 assert the circles rollback's refusal when chat exists.
- **NOTE 1:** the S1 test moves the first announcement back 61 seconds before the second, so plan 1's `'Too fast'` doesn't answer it. Task 2.
- **NOTE 3:** the decisions log names Decisions 1 to 6. Task 4.
- **NOTE 4:** `chats.last_message_at` moves back with `last_message_id`. Task 2.
- **NOTE 6 (plan 2's part):** `shownMessages` in `chatModel.ts` is the function behind "the list skips it". Task 3.

## Global Constraints

Chat plan 1's Global Constraints, verbatim, with the migration `supabase/migrations/20261111150000_chat_groups.sql`. Plus:
- The announcement audiences already mean "Going this Thursday" and "Everyone in the group" once group attendees are members (`private.announcement_audience`, plan 1, built on `private.chat_members` by confirmation S1): do not redefine them.
- **Shared interfaces** are the rulings' table (`.superpowers/sdd/challenges/chat-rulings.md`), verbatim. Where plan 1's text differs, the table wins. Where chat core's built code differs from either, the built code wins (Revised 12 November; the report lists the table's out-of-date rows).
- Every chat-line trigger function this plan defines or redefines writes nothing when `current_setting('resbite.system', true)` is `roll` or `deletion`. Plan 1 built that test as `private.chat_lines_off()` (`chat_core.sql:905-907`), the first statement of each of its line triggers: call it the same way. The roll writes `ended` and `next` itself, on purpose, through `private.chat_system_line` (which checks no flag, :894-899).
- System lines store `author_id null` and `payload.actor`. Every other person in a payload is a uuid. `private.chat_system_line(p_plan, p_event, p_payload)` writes `actor` as `auth.uid()` unless the payload names `actor` (the payload's keys win), so a line with no actor passes `'actor', null` explicitly. `private.chat_names` names only `actor`, `user` and `brought_by` (:222-235). This plan's payloads add no other person key, so it needs no change.
- Bodies copied from chat core are copied as built at sha256 `1047fb37…ce` (the Revised 12 November section). The roll is copied from the circles migration `supabase/migrations/20261111130000_circles_of_trust.sql` as built at sha256 `04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256` (`:585-642`), and its rollback restores that exact body (I9). If either file's hash differs when this plan is built, stop and re-base the copy. Each SQL function is created after what its body names, as chat core does (:117-118).
- No line writer takes the chat's advisory lock (`hashtextextended('chat:'||series, 0)`). A line's event already holds its plan row, and a send takes the advisory lock before that row, so the two would deadlock (:886-889). Only `send_message` and `send_announcement` take it.
- A new table revokes all from `public, anon, authenticated, service_role`. A new function revokes execute from the same four before its explicit grants (K-S5).

## Decisions this plan makes

1. **Any way back in clears a leave** (G-N1). The trigger clears it on any attendee insert, as Review Focus 6 expects, and on a guest row moved to the person by a fold (`update of user_id`, I7). An old personal link would otherwise let a leaver back in by answering Can't go, so `leave_series` revokes the leaver's personal links on the current occurrence, as `remove_guest` does. Their `invited` notice goes with the row, as `remove_guest`'s does, so an invitation back is told again (I6).
2. **The leave record is only the roll's skip list** (G-S5). Membership of a group is the hosts and the attendee rows of the current occurrence. One exception: someone who leaves after the current occurrence ended keeps their row, a real attendance, and is out of the chat at once (G-N13). Such a leaver can't be re-invited until the roll. `invite_contacts` answers `already` for the row and inserts nothing, so the leave stays, and the roll then skips them (confirmation NOTE 15). A leave from a closed group is allowed and writes its `left` line, as other lines are written to a closed chat (`cancelled` is) (challenge NOTE 12).
3. **Two new system lines.** Edit → "Doesn't repeat" writes "Ana stopped repeating this · the last one is Thu 27 Nov" (G-N13). A one-off with messages that becomes a group writes "Ana made this a group · everyone invited can read this chat" (G-N8). The spec has neither.
4. **A group stops when its owner can no longer use the app** (G-S4). The roll skips such a plan, so `stopped` counts an owner who is not `user_eligible`, and the chat closes 48 hours after the last end.
5. **The roll drops a "brought by" that points outside the group** (G-N3). A carried row whose bringer is not carried gets `brought_by = null`.
6. **On a group, a reply flip changes one fact at a time** (confirmation S3, CH-R-A5). A `cant_go` line coalesces only into that person's `cant_go` line from the last 10 minutes on the current occurrence. A `joined` line is never rewritten, since membership did not change. A change back to Going or Maybe within 10 minutes of the person's `cant_go` line on the current occurrence deletes that line. A line about an earlier week, or one more than 10 minutes old, stays (I2). It takes `state = 'deleted'`, so the existing signal carries the deletion to open screens. Chat core confirms this is the only way: `chat_messages_since` reports new and changed rows, never ones removed by SQL `delete` (final review m6). The app's `merge` keeps a `deleted` row as final (`mobile/src/state/chatModel.ts:33-75`). H33's "no later line names them" guard keeps the merge, since it protects the feed's order. The delete moves nothing, so it doesn't take the guard.
7. **A group's open chat pushes in a cancelled week** (P2-Q1, ruled). For a group, a `chat_message` or `announcement` notice is eligible while `private.chat_open(series)` holds, whatever the status of the notice's plan: after "Cancel just this one", and for the 48 hours after "Cancel this and stop repeating" or a stop by Edit. A one-off keeps plan 1's `plan.status<>'cancelled'` (H30). Mute chat and Mute this resbite still apply. Cost if wrong: pushes in a cancelled week, which mute stops.
8. **The When sheet's chat line hides while Repeats is set** (P2-Q2, ruled). It shows as built otherwise. No new copy.
9. **A pending group member keeps both the Chat row and the announcement line** (P2-Q3, ruled), as built.
10. **No server field for a group's current occurrence** (P2-Q4, ruled). The dot can sit on an older tile until the list refreshes.
11. **A member who hasn't answered reads no exact place in the chat** (I11; owner question G-QA, this default). The resbite page shows such a reader the area, never the place: `placeLine` (`mobile/src/domain/eventPage.ts:306-313`) through `eventPlace` (`mobile/src/domain/eventView.ts:44-53`, GI1), for a guest whose reply is null or `pending`, and never for a host. The server applies the same rule to the chat's lines. `private.chat_row` leaves `place_label` out of a `next` or `changed` payload for a reader who is neither a host of the current occurrence nor a guest who has answered on it. Every chat read builds its rows with `chat_row`, so the RPCs never hand the place over. One-offs are unchanged, since everyone in a one-off's chat has answered or is a host. The limit: such a reader can still read the plan row's `place_label` through `plan_read` (`20260917190517_resbite_private_tester_foundation.sql:122`), as any invitee who hasn't answered could since GI1. This decision closes the chat's path only. Cost if wrong: the place missing from two kinds of line for people who haven't answered.
12. **Turning the repeat back on removes the "stopped repeating" line** (I8; owner question G-QB, this default). Edit back to "Every week" deletes the series' latest `stopped` line that is still `sent`, by state, with Decision 6's `last_message_id` care. Nobody is told it resumed. The alternative, a new "Ana set this to repeat again" line, needs approved wording.
13. **The roll depends on CO-Q1 staying "carried"** (I9; owner question G-QC, which is the circles runbook's CO-Q1, still open). Only repeating resbites roll, and every repeating resbite is a group, so CO-Q1's alternative (not carrying a brought person who said Can't go) would remove them from the group and its chat at the roll. That goes against CH-D3 and CH-P20. If the owner chooses the alternative anyway, the circles roll changes before its migration, and this plan's copy is re-based on the new circles body and hash.
14. **"Next one" opens the newest occurrence the reader may read** (I5). That is the summary's current `planId`, never the line's `payload.plan_id`. Every member of a group's chat is a host of the current occurrence or has a guest row on it, so `private.can_read_plan` holds there (`20260917190517_resbite_private_tester_foundation.sql:99-102`). A late joiner has no row on older occurrences. With no `planId` to open, the tap re-reads the chat instead of opening an event page that can't load. Every "Next one" line, old or new, is the same button.

## Review Focus

1. **The host turns "every Thursday" off before the first Thursday.** Expected: the series stays a group (CH-P1). The chat says "Ana stopped repeating this · the last one is Thu 27 Nov", keeps everyone, and closes 48 hours after that occurrence's end. Test in Task 1.
2. **"Cancel this and stop repeating", on a first occurrence or days after Edit stopped the series.** Expected: the chat closes 48 hours after the cancellation, never at once (G-S1). Test in Task 1.
3. **The roll creates next Thursday.** Expected: "Board game night ended" on the old occurrence and "Next one: Thu 20 Nov · Ana's flat" on the new one. No "joined" or "admin" line for anyone carried, because the roll sets the flag itself, not because a test did (G-B6, I1). After "Cancel just this one", "Ana cancelled this Thursday" and no "ended" line (G-S2). Test in Task 2, and in the concurrency script's clean session.
4. **A member leaves while the roll runs.** Expected: they are not carried, and never end up with a row but outside the chat (G-S5). Test in Task 2, by the concurrency script.
5. **A member who has not answered, right after a roll, opens the people list.** Expected: every member's name, with Connect (CH-P21, G-B5). Someone who left or was removed sees the one-off rule on every occurrence (G-S3). Tests in Tasks 2, 3 and 4.
6. **A member who left is invited again (by a host or a circle).** Expected: the leave is cleared, they are back in the group and its chat, and they are told, even the same week (I6). The same holds when their row arrives by a fold (I7). Their old personal link no longer answers (G-N1). Tests in Tasks 1 and 2.
7. **The owner can no longer use the app, and hosted data from before the release.** Expected: the chat closes 48 hours after the last end (G-S4). Long-finished stopped groups come out closed, and recently stopped ones get their 48 hours (G-B7). Tests in Task 1 and its `after.sql`.
8. **A group member says Can't go, then Going again a few minutes later.** Expected: "Sol can’t make it this week" goes for everyone, open screens included, and an earlier "Sol joined" stays (Decision 6). Last week's line, or one older than 10 minutes, stays (I2). Test in Task 2.
9. **"Cancel this and stop repeating", then the crew says goodbye.** Expected: for 48 hours each message and announcement is pushed as on any open chat, minus mutes. Then nothing is pushed. A cancelled one-off still pushes nobody (Decision 7, P2-Q1). Test in Task 2.
10. **Pedro brings Clara, who hasn't answered this week.** Expected: the chat's "Next one" and place-change lines give her no place, through any read, while the resbite page shows her only the area (Decision 11, I11). Tests in Tasks 2 and 3.
11. **A late joiner taps an old "Next one" line.** Expected: it opens the occurrence they are on, never an error page (Decision 14, I5). Test in Task 4.

---

### Task 1: Migration section 1: the group flag, membership, closing and the summary

**Files:**
- Create: `supabase/migrations/20261111150000_chat_groups.sql` (section 1), `supabase/tests/chat-groups.sql` (slice 1; add it to `supabase/tests/hosted-baseline/tests.txt`, after `chat.sql`), `supabase/tests/hosted-baseline/20261111150000_chat_groups.before.sql`, `.after.sql`. In full mode `chat-groups.sql` runs before `chat.sql`, since the glob sorts `-` before `.` (`scripts/test-database.sh:28`), and after it in `tests.txt`. That is harmless: each file's transactions roll back.
- Modify: `supabase/tests/chat.sql` (plan 1's weekly-series assertions, Step 3)

**Interfaces:**
- Consumes, as built at sha256 `1047fb37…ce`:
  - `public.chats` (`chat_core.sql:76-83`) with its `is_group boolean not null default false`;
  - `private.chat_is_group(p_series)` (:172-175) and `private.current_occurrence(p_series) returns public.plans` (:122-127: the plan nothing repeats from, the latest start, then the highest id);
  - `private.chat_member(p_series, p_user)` (:132-138) and `private.chat_members(p_series)` (:143-150);
  - `private.chat_closes_at(p_series)` (:156-159) and `private.chat_open(p_series)` (:165-168);
  - `private.chat_system_line(p_plan, p_event, p_payload)` (:894-899) and `private.chat_lines_off()` (:905-907);
  - `private.chat_summary(p_series)` (:248-274) behind `public.chat_summary` (:276-280);
  - `messages_touch` (:62-72), `messages_chat_stats` (:396-418: it ignores a system row's state change, :400-403, and locks the `chats` row at :407) and `messages_signal` (:1101-1111);
  - `private.plan_end`, `private.user_eligible`, `private.is_host`, `private.can_read_plan`.
- Produces:
  - `public.chats` gains `stopped_at timestamptz null`. Plan 1 already creates `is_group boolean not null default false` and never sets it true (CH-R-A6). This plan adds no `is_group` column and no function named `chat_is_group`. It sets the flag through the backfill and `plans_group_flag`, and every group test below reads it through plan 1's `private.chat_is_group`.
  - Backfill, in the migration:
    - `is_group = true` for every series with an occurrence whose `repeat_weeks` is not null or whose `repeats_from` is not null.
    - `stopped_at = least(now(), private.plan_end(current.starts_at, current.ends_at))` for every group whose current occurrence (`private.current_occurrence`, chat core's pick) has `repeat_weeks` null, cancelled or not (G-B7). It runs after chat core's backfill, which made one `chats` row per series (`chat_core.sql:97`). At `3b5be48`, `public.plans` holds no cancellation or change time (only `created_at`, `version` and `guest_note_at`), so the end stands in for it.
    - A long-finished stopped group comes out closed. A group stopped recently, or cancelled ahead of its date, stays open until its 48 hours pass.
    - A series whose only occurrence lost its rule before the release can't be told from a one-off, and stays one. Its chat has no messages, since chat ships in this release.
  - `private.series_leaves (series_id uuid not null, user_id uuid not null references public.profiles(id) on delete cascade, left_at timestamptz not null default now(), primary key (series_id, user_id))`. RLS on, no policies, all revoked from the four roles.
  - Trigger `attendees_clear_leave` after insert or update of `user_id` on `public.attendees`, function `private.attendees_clear_leave()`: deletes the leave of `new.user_id` for the plan's series (Decision 1). The update case is a fold (`update public.attendees set user_id=p_into …`, `chat_core.sql:1016`), which moves a row by update and never inserts. `attendees_close_waiting` fires on the same update for the same reason (`circles_of_trust.sql:85`) (I7). No grants.
  - `private.chat_hide_line(p_id bigint) returns void`, plpgsql, no grants. It is the one way a system line leaves the feed (Decision 6, I8):
    - it sets the system row's `state = 'deleted'`, so `messages_touch` moves `updated_at` and `messages_signal` fires;
    - `messages_chat_stats` ignores that change (:400-403), so the function then locks the `chats` row as that trigger does (:407; never the `chat:` advisory lock, :886-889), checks that `last_message_id` still points at the row, and if so moves it to the series' newest row that is not a deleted system line. `last_message_at` moves with it to that row's `created_at`, both null when no row is left (confirmation 2, NOTE 4).
    - A row that is not a `sent` system line is left as it is.
  - `private.group_stopped(p_series uuid) returns boolean`: `is_group`, and either `stopped_at` is set or the current occurrence's owner is not `private.user_eligible` (G-S4). No grants.
  - Trigger `plans_group_flag` after insert or update of `repeat_weeks, status` on `public.plans`, function `private.plans_group_flag()`. It acts only when the row is its series' current occurrence. On update it compares OLD with NEW (G-N4).
    - An insert with `repeat_weeks` not null, or an update from null to not null: `is_group = true` and `stopped_at = null`.
    - On an update from null to not null on a series that was already a group (a resume), it also deletes the series' latest `stopped` line that is still `sent`, through `private.chat_hide_line` (Decision 12, I8). It writes no line of its own.
    - An update into `status = 'cancelled'` with `new.repeat_weeks` null ("Cancel this and stop repeating"): `stopped_at = now()`, overwriting any earlier value (G-S1). Only on a series whose `is_group` is true: a cancelled one-off keeps `stopped_at` null (challenge NOTE 12).
    - An update from not null to null with `status` still `active` (Edit → "Doesn't repeat"): `stopped_at = coalesce(stopped_at, now())`.
    - `is_group` never goes back to false (CH-P1).
    - It writes the `chats` row by upsert (`insert … on conflict (series_id) do update`), so it never depends on firing after plan 1's `plans_chat_row` (G-N4).
    - Its lines go through `private.chat_system_line`, and its one removal through `private.chat_hide_line`, never while `private.chat_lines_off()` is true (the roll or deletion flag). The flag and stop columns are still written under the flag:
      - `made_group {actor}` when `is_group` turns true on a chat whose `message_count` is above 0 (G-N8). As built, `message_count` counts sent messages and announcements only, never system lines (`chat_core.sql:389-418`, K-N12);
      - `stopped {actor, plan_id, starts_at, time_zone}` on Edit → "Doesn't repeat", with the current occurrence's id, start and zone (G-N13).
  - `private.chat_member(p_series, p_user)` redefined, copied from the built body (`chat_core.sql:132-138`, SQL over `private.current_occurrence`, false for a null user or a series that doesn't exist, both tested at `chat.sql:186-205`). On a group: a host of the current occurrence, or anyone with an attendee row on it, whatever the reply (G-S5). One exception, not a member: a leave exists for (series, user) and the current occurrence has ended (Decision 2). One-offs keep plan 1's rule. `private.chat_members` is not redefined, since it filters by this function (:143-150).
    - Its cost grows with people × occurrences, chat core's note says. `chat_members` calls `chat_member` once per candidate, and each call resolves `current_occurrence` again (:122-127, through `plans_series_idx` and `plans_repeats_from_key`). This plan adds a `series_leaves` probe and, on a group, the ended test. That is accepted for groups of tens, as G-S3's note for `can_see_guests` says.
  - `private.chat_closes_at(p_series)` redefined, copied from the built body (:156-159), for a group:
    - null while `private.group_stopped(p_series)` is false (it never closes while the series runs);
    - `stopped_at + 48 h` when the current occurrence is cancelled and `stopped_at` is set;
    - else `private.plan_end(current) + 48 h` (stopped by Edit, or an owner who may no longer use the app).
    - One-offs keep plan 1's rule.
  - `private.chat_open(p_series)` redefined, copied from the built body (:165-168), for a group: `chat_closes_at` null means open, whatever the current occurrence's status, so "Cancel just this one" keeps the chat open (CH-P15). Else `now() < chat_closes_at`. One-offs keep plan 1's rule (`coalesce(now() < chat_closes_at, status <> 'cancelled', false)`), and a series that doesn't exist stays not open (`chat.sql:203-204`). The app decides "closed" only from `open` (G-N5).
  - `private.chat_summary` redefined, copied from the built body (:248-274); `public.chat_summary` (:276-280) is not touched. Plan 1 already returns `is_group` as `coalesce(v_chat.is_group, false)` (:260). Plan 2 changes one key: `'stopped', false` becomes `'stopped', private.group_stopped(p_series)`. `repeat_weeks`, `members`, `going` and `everyone` stay as built, and `members` covers a group through this plan's `chat_member`. Plan 3 copies this body.
  - Order in the file: `series_leaves` and `group_stopped` before `chat_member` and `chat_closes_at`, since those are SQL and are checked when they are created (chat core's order, :117-118).
  - `public.series_is_group(p_series uuid) returns boolean`, with `private.series_is_group`: true when the series' `is_group` is true and `private.chat_member(p_series, auth.uid())` holds; false otherwise. That member test covers the hosts of the current occurrence. It is the group branch of `can_see_guests` (Task 2), so the event page never takes someone for a group member whom the people list treats as an outsider. One case: a leaver after the end keeps a guest row, so `can_read_plan` passes on the current occurrence, but they are no member (challenge NOTE 3). Execute revoked from the four roles, granted to `authenticated` only.

- [ ] **Step 1: Failing SQL test, slice 1** (`supabase/tests/chat-groups.sql`). Ids use the hex prefix `e6` and emails `g2-…@resbite-test.invalid`. Each block is rolled back, as `supabase/tests/connections.sql` does: slice 1 is one block, and slice 2 has six (Task 2). Each block starts from the same cast, made by `pg_temp.e6_cast()` as `chat.sql`'s `pg_temp.c1_cast()` makes its own (`chat.sql:7-9`).
  - The cast: owner 01, admin 02, guests 03 Going, 04 Maybe, 05 pending, 06 Can't go, and 08, a stranger.
  - 07, 09, 10, 11 and 12 have accounts that used the app and may use it (the cast's grants, so the roll carries them), and no guest row. Each test says how they come in.
  - Three plans with the same people, all made with `create_plan_v4` as 01: the weekly "Board game night", a second weekly "Film club" (used by slice 2), and the one-off "Picnic".
```sql
-- is_group true after create_plan_v4 with repeat_weeks 1. The one-off: false.
-- 01 sends one message on the weekly series. Then change_plan_v4 with repeat_weeks null on the weekly plan: is_group still
--   true, stopped_at set, chat_closes_at = end + 48 h, and one line stopped {actor: 01, plan_id, starts_at, time_zone}
--   with author_id null. chats.last_message_id is that line's id.
-- I8: change_plan_v4 with repeat_weeks 1 again (a resume): stopped_at null, chat_closes_at null, chat_open true, the
--   stopped line reads state 'deleted', no new line is written, chats.last_message_id is 01's message id and
--   last_message_at its created_at.
-- A one-off with one message, then change_plan_v4 with repeat_weeks 1: is_group true, one line made_group {actor: 01}.
--   A one-off with no messages made weekly: no made_group line.
-- chat_member true for 01..06 on the group. On the one-off: 05 and 06 false.
-- A row on the running current occurrence plus a leave inserted by hand: chat_member true (no leave test while it runs).
-- I7, on Film club (so Board game night's counts below hold): a leave for 07 inserted by hand, and a guest row for 12 on
--   Film club's current occurrence (by hand, under the flag). Then update public.attendees set user_id = 07 where
--   user_id = 12 (a fold's move): 07's leave for Film club is gone.
-- Cancel with p_stop_repeating on a first occurrence: chat_open true at 47 h after the cancel, false at 48 h (move stopped_at).
-- G-S1: Edit to Doesn't repeat, move stopped_at back 3 days, then cancel: stopped_at within a second of now(),
--   chat_open true at 47 h after the cancel.
-- Cancel just this one: chat_closes_at null, chat_open true.
-- G-S4: make 01 ineligible (remove 01's roster row or revoke 01's live grant, whichever the fixture uses):
--   chat_summary.stopped true, chat_closes_at = plan_end(current) + 48 h.
--   With the current occurrence cancelled and the rule kept (as account deletion leaves it): the same closes_at.
-- chat_summary as 05: is_group true, stopped false, repeat_weeks 1, members 6 (01 and every attendee row).
-- series_is_group as 08 (stranger): false. As 05 (pending member): true.
-- Announcement audiences on the group: going = 01 02 03 04, everyone = 01..06 (announcement_audience unchanged).
-- Direct select on private.series_leaves as authenticated: insufficient_privilege.
-- Last in the slice (challenge NOTE 12): 01 cancels the one-off. Its chats row keeps stopped_at null.
```
- [ ] **Step 2: Run** `bash scripts/test-database-docker.sh` → FAIL (`chats.stopped_at` missing).
- [ ] **Step 3: Implement** section 1. Plan 1's `supabase/tests/chat.sql` asserts one-off rules on its weekly fixture, "Thursday run" (`pg_temp.c1p('02')`: owner 01, admin 02 Going, 03 Going, 05 not answered; plan 1's Decision 4). That series is now a group from `create_plan_v4` on (`plans_group_flag` on insert): change those assertions to expect every attendee row a member, and keep the one-off matrix on the one-off fixture (`c1p('01')`). The ones this section breaks, as built:
  - `chat.sql:172-183`, plan 1's CH-R-A6 block (confirmation 2, SHOULD 1). "No chat row is a group" and `chat_is_group(c1p('02'))` false now expect the weekly series true and every other row false.
  - `chat.sql:207-224`, the audiences block. Keep `:211-216`, which assert the one-off's `going` (01 02 03 04) and `everyone` (01 to 05) audiences and that an unknown audience reaches nobody, since slice 1 tests the audiences only on the group. Drop `:217-224`, which set `is_group` by hand on the one-off: under this plan a hand-set flag makes the one-off's not-answered and Can't-go guests members, so its audiences change. It proved plan 1 alone. Cut the comment's last sentence (`:208-209`, "With is_group set by hand …") to match. This plan's slice 1 audiences and the S1 test in Task 2 replace the dropped lines (challenge NOTE 1).
  - `chat.sql:314-349`, the weekly series around the roll:
    - members before the roll are `01,02,03,05`, and after it `01,02,03,05` (everyone carried), also once 03 answers Going;
    - `chat_closes_at` is null and `chat_open` true while it runs;
    - "The roll made a group" goes, and the summary's `is_group` is true.
  - `chat.sql:571` and `:621-622`: 05's `my_chat_overview` now lists the weekly chat (05 is a member).
  - `chat.sql:727-730` (the slice's comment) and `:916-935`: 03's weekly message is told to `01,02,05`. `:912`, 02's weekly announcement to `01,03,05`, still holds.

  Task 2's roll lines and way-back block break three more (Task 2, Step 4). Run the file to find any other.
- [ ] **Step 4: Rehearsal files** (G-B7). `before.sql` runs after plan 1's migration on the hosted baseline and creates three rolled series (two occurrences each, the second with `repeats_from`):
  - (a) the current occurrence cancelled with `repeat_weeks` null, its end 10 days ago;
  - (b) the current occurrence stopped by Edit (`active`, `repeat_weeks` null), its end 1 hour ago;
  - (c) the current occurrence cancelled with `repeat_weeks` null, its start 3 days ahead.

  `after.sql` asserts:
  - `is_group` true for all three;
  - (a) `chat_open` false (long-finished: closed);
  - (b) `chat_open` true and `chat_closes_at` equal to its end + 48 h;
  - (c) `chat_open` true and `chat_closes_at` within a minute of `now() + 48 h` (recently stopped: its 48 hours);
  - `stopped_at` exists, `series_leaves` has RLS on and no grants, and `series_is_group` is executable by `authenticated` only.

  Follow chat core's rehearsal files (`20261111140000_chat_core.before.sql:1-14` and `.after.sql:215-219`):
  - insert the plans directly, `series_id` and `repeats_from` set, ids with the prefix `e6`;
  - add no roster row: the harness fails if `private.tester_roster` isn't empty at the end (`scripts/test-database.sh:61-63`);
  - `after.sql` ends by deleting every row `before.sql` made. That includes the `public.chats` rows by series, since `chats` has no foreign key to `plans`, and any `series_leaves` rows.

  Chat core's own `after.sql` runs before this migration in that mode, so its "no row is a group" check still holds there and needs no change.
- [ ] **Step 5: Run** both modes → PASS. The hosted-baseline mode names all four candidates, in order (bare, it fails by design while `tests.txt` lists tests of migrations not yet live; `qa/chat-release/README.md:110-113`):

  ```
  bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261111120000_connections_follow_ups.sql supabase/migrations/20261111130000_circles_of_trust.sql supabase/migrations/20261111140000_chat_core.sql supabase/migrations/20261111150000_chat_groups.sql
  ```
- [ ] **Step 6: Commit:** `"Groups: the group flag, who is in a group's chat, and when it closes"`

### Task 2: Migration section 2: the group lines, the roll, leaving and visibility

**Files:**
- Modify: `supabase/migrations/20261111150000_chat_groups.sql` (section 2), `supabase/tests/chat-groups.sql` (slice 2), `supabase/tests/chat.sql` (the roll's lines, the whole `cancelled` payload and the way-back block, Step 4), `scripts/test-database.sh` (run the new script with the other concurrency scripts in full mode), `supabase/tests/hosted-baseline/20261111150000_chat_groups.after.sql` (the rehearsal)
- Create: `supabase/tests/local/leave-series-concurrency.sh`, `supabase/rollback/20261111150000_chat_groups.rollback.sql`

**Interfaces:**
- Consumes: Task 1; chat core's `private.attendees_chat_lines()` (`chat_core.sql:920-955`, trigger `attendees_chat_lines` after insert or update of `response`) and `private.plans_chat_lines()` (:963-982, trigger `plans_chat_lines` after update), as built; `private.plan_admins_chat_lines()` (:986-993); `private.chat_lines_off()` (:905-907); `messages_chat_stats` (:396-418) and `messages_signal` (:1101-1111), which every insert and update of a message fires; the latest `private.can_see_guests` (`20261031120000_creating_a_resbite.sql:621`), `private.request_connection` (the follow-ups migration, `20261111120000_connections_follow_ups.sql:130`), `private.roll_repeating_plans` (the circles migration, `20261111130000_circles_of_trust.sql:585-642`, sha256 `04062e2b…`); the personal-link revokes and the notice delete of the latest `private.remove_guest` (`20261111130000_circles_of_trust.sql:651-679`; the `invited:'||p_plan||':'||p_user` key at :669, the same key `invite_contacts` queues with `on conflict do nothing` at :369 and :418, and the roll at :625). Chat core redefined none of these four. Also, as built: `private.chat_row(p_message, p_viewer)` (`chat_core.sql:209-215`), which every chat read builds its rows with (:254-255, :288, :311, :345); `private.notification_recipient_eligible(p_outbox)` (:652-692, three branches: the plan kinds, the connection kinds, the chat kinds, the last with `plan.status<>'cancelled'` at :685); Task 1's `private.chat_hide_line`, `private.chat_open` and `private.chat_member`.
- Produces:
  - `private.attendees_chat_lines()` redefined, copied from the built body (:920-952) with its `chat_lines_off()` check first. The built merge rules stay for every chat:
    - the search keeps to rows updated in the last 10 minutes (`messages_series_updated_idx`), then tests `created_at`;
    - a line merges only while no later system line names the person (H33);
    - only `joined` and `cant_go` lines are searched.

    Chat core's note asks plan 2 to narrow the search from the whole series (:939-943) to the current occurrence: add `m.plan_id = new.plan_id`. A one-off has one occurrence, so nothing changes for it. The built search doesn't test `state`, since plan 1 never changes a system line's state, so add `m.state = 'sent'`: a deleted line is never merged into or brought back. On a group (Decision 6, confirmation S3). The trigger fires on every `update of response`, changed or not, so each case names its old states (challenge NOTE 4):
    - an insert, whatever its reply, writes `joined {actor, user, brought_by?}`. A `joined` line is never rewritten;
    - an update from `accepted`, `maybe` or `pending` into `declined` or `withdrawn` writes `cant_go {actor, user}`, or updates in place that person's shown `cant_go` line from the last 10 minutes on this occurrence, while H33's guard holds;
    - an update from `declined` or `withdrawn` into `accepted` or `maybe`, within 10 minutes of that person's shown `cant_go` line on this occurrence, deletes the line through `private.chat_hide_line` (Task 1). That takes `state = 'deleted'`, not a SQL `delete`, since `chat_messages_since` never reports one (final review m6). The open screens learn of it through `messages_signal` and `chat_messages_since`, and `chats.last_message_id` moves back with it (confirmation 2, NOTE 4). H33's guard doesn't apply to the delete, which moves nothing (I2);
    - nothing else writes a line: `declined` to `withdrawn` or back, a reply sent again unchanged, `pending` into `accepted` or `maybe`, and a line from an earlier occurrence or more than 10 minutes old all leave the chat as it is.

    One-offs keep plan 1's transitions and its 10-minute rule (K-S2). The roll writes nothing because it runs under the roll flag (G-B6). Nothing infers "by the roll" from `repeats_from` any more (G-N2).
  - `private.plans_chat_lines()` redefined, copied from the built body (:963-980). The built `cancelled` line is `chat_system_line(new.id, 'cancelled', '{}')`, so its payload is `{actor}` (:967-968). It becomes `{actor, stop, starts_at, time_zone}`, where `stop` is `new.repeat_weeks is null` and the two others are the cancelled occurrence's (G-S2). Everything else as built.
  - `private.plan_admins_chat_lines()` is not redefined. Its built `chat_lines_off()` check (:988) already silences it when the roll re-inserts an admin (G-B6). Until this plan's roll sets the flag, the real roll writes an `admin` line for each carried admin (chat core's Decision 4, L9), which is one reason the three plans ship together.
  - `private.roll_repeating_plans()` redefined, copied from the circles version as built at sha256 `04062e2b…` (`circles_of_trust.sql:585-642`; Global Constraints, I9). That body carries every guest row, a brought guest who said Can't go included, with their bringer and level. This plan depends on that (Decision 13, CO-Q1 "carried"). The only changes:
    - first statement: `perform set_config('resbite.system','roll',true)`. The setting lasts to the end of the calling transaction. The older tests that call the roll (`creating-a-resbite.sql`, `connections-follow-ups.sql`, `circles-of-trust.sql`) check no chat line after it, and `chat.sql:322-325` already resets it after its roll;
    - the carried-attendee insert (`:620-621`) skips users with a `series_leaves` row for the series;
    - after that insert, a carried row whose `brought_by` has no carried row on the new occurrence gets `brought_by = null` (G-N3);
    - after the new occurrence is in, two lines through `private.chat_system_line`, both with `'actor', null` in the payload (else it writes `auth.uid()`):
      - `ended {actor, title}` on the previous occurrence (`plan_id = p.id`, `title = p.title`), only when `p.status <> 'cancelled'` (G-S2, G-S6);
      - `next {actor, plan_id, starts_at, time_zone, place_label, place_tbd}` on the new occurrence.
  - `public.leave_series(p_series uuid) returns void`, with `private.leave_series`:
    - resolves the current occurrence and takes it `for update`, the row lock the roll holds. It then resolves "current" again, and locks the new one when the roll created it meanwhile (G-S5);
    - a group and a member, else `42501 'Not in this group'`;
    - the owner gets `42501 'Owner can''t leave'`, an admin `42501 'Hosts can''t leave'`;
    - inserts the leave, `on conflict do update set left_at = now()`;
    - revokes the caller's personal links on the current occurrence as `remove_guest` does: `private.invitations` claimed by the caller and `private.phone_invitations` for the caller (G-N1);
    - deletes the caller's attendee row on the current occurrence, unless that occurrence has ended and was not cancelled. Then the row stays, a real attendance (G-N13), and `chat_member` already leaves them out (Decision 2);
    - when it deletes the row, it also deletes the caller's invitation notice on that occurrence, `delete from private.notification_outbox where dedupe_key = 'invited:'||<current occurrence>||':'||<caller>`, sent or not, with its deliveries, as `remove_guest` does (`circles_of_trust.sql:669`). An invitation back then queues a new one, so a re-invite the same week pushes (I6). A kept row keeps its notice;
    - writes `left {actor, user}`, both the caller, also on a closed group (Decision 2, challenge NOTE 12). No outbox. The delete writes no line of its own, since `attendees_chat_lines` fires on insert or an update of `response` only (:954-955).
    - Execute revoked from the four roles, granted to `authenticated` only (both bodies, as chat core grants its calls, e.g. :280).
  - `private.can_see_guests(p_plan)` redefined, copied from `creating_a_resbite.sql:621`. Its existing tests come first. A group branch comes last: the plan's series `is_group`, the caller has an attendee row on the plan (any reply), and `private.chat_member(series, auth.uid())` holds now (G-S3). Someone who left or was removed falls back to the one-off rule on every occurrence. `can_read_profile` and the avatar policy follow through it.
    - Cost (G-S3): `can_see_guests` runs per row in `attendee_read` and inside `can_read_profile`'s loop over plans. Hosts and answered guests never reach the group branch. `chat_member` resolves the current occurrence once, through `plans_series_idx` and `plans_repeats_from_key`. A pending member's people list pays one such lookup per row read, accepted for groups of tens.
  - `private.request_connection` redefined, copied from the follow-ups version with its `detail` kept. On a group the target may be any attendee, pending included. This replaces the CH-P21 comment at its target check. The caller still passes `can_see_guests` first, so a leaver asking from a past occurrence gets `42501 'Names required'`. Plan 3 copies this body.
  - `private.notification_recipient_eligible(p_outbox)` redefined, copied from the built body (`chat_core.sql:652-692`, `create or replace` there, so its grants are kept: nobody) (P2-Q1, Decision 7, B1). In the third, chat branch only, `plan.status<>'cancelled'` (:685) becomes
    `case when private.chat_is_group(msg.series_id) then private.chat_open(msg.series_id) else plan.status<>'cancelled' end`.
    Everything else is verbatim: the first two branches, the age rules (an hour for `chat_message`, a day for `announcement`), membership at claim time, both mutes, `msg.state='sent'`. It comes after Task 1's `chat_open`, which its SQL body names. Plan 3 copies this body, not chat core's (plan 3's ruling B2).
  - `private.chat_place_hidden(p_series uuid, p_viewer uuid) returns boolean`, SQL, no grants (Decision 11, I11). It is the resbite page's place rule for the chat: true unless the viewer is a host of the series' current occurrence (`private.is_host`) or has a guest row on it whose `response` is not `pending`. A series that doesn't exist gives true. It comes before `chat_row`.
  - `private.chat_row(p_message, p_viewer)` redefined, copied from the built body (:209-215). One change: `'payload'` is `p_message.payload - 'place_label'` when the row is `kind = 'system'` with `event in ('next','changed')` and `private.chat_place_hidden(p_message.series_id, p_viewer)`; else the payload as built. Every other key stays (`place_tbd` included, which names no place). The reads are not redefined: `chat_messages` (:288), `chat_messages_since` (:311), `chat_summary`'s `pinned` and `last` (:254-255; a pinned row is an announcement, so only `last` can be such a line) and `my_chat_overview`'s `last` (:345) all build their rows with it. So do plan 3's copies of them. The helper runs only for those two events, which keeps a page of 100 rows cheap.
  - Rollback, `supabase/rollback/20261111150000_chat_groups.rollback.sql`, in this order:
    - refuse while plan 3 is applied (`private.blocks` exists) with `'Run the chat safety rollback before the chat groups rollback'`, as the connections rollback guards its order (G-N11) and as chat core's rollback guards against this plan (`supabase/rollback/20261111140000_chat_core.rollback.sql:44-49`);
    - drop the triggers `plans_group_flag` and `attendees_clear_leave`;
    - restore chat core's `attendees_chat_lines()`, `plans_chat_lines()`, `chat_member`, `chat_closes_at`, `chat_open`, `private.chat_summary`, `private.notification_recipient_eligible` and `private.chat_row`, each byte for byte as built at sha256 `1047fb37…ce` (:920-952, :963-980, :132-138, :156-159, :165-168, :248-274, :652-692, :209-215), written `create or replace` so their grants stay. `chat_row` goes back before `chat_place_hidden` is dropped, so no read ever calls a missing helper;
    - restore `creating_a_resbite`'s `can_see_guests`, the follow-ups `request_connection` and the circles `roll_repeating_plans` (as built at sha256 `04062e2b…`, `:585-642`);
    - drop `leave_series` and `series_is_group` in both schemas, `group_stopped`, `chat_hide_line`, `chat_place_hidden`, `plans_group_flag()` and `attendees_clear_leave()`;
    - drop `series_leaves` and the `stopped_at` column. Dropping `series_leaves` is what lets chat core's rollback run next: its guard refuses while that table exists;
    - set `is_group = false` on every `chats` row, leaving the column to plan 1, whose rollback drops it with the table (CH-R-A6). Plan 1 sets the flag true nowhere, so its audiences then read as before.

    Its header says what is lost: every leave record, every group flag's value and every stop time. It also says:
    - roll back in reverse order only, plan 3's first, because plan 3 copies this plan's `request_connection`, `chat_summary` and `notification_recipient_eligible` (G-N11, B1). The guarded chain is chat 3 → chat 2 → chat 1 → circles → follow-ups (chat core rollback, lines 34-42);
    - this plan's lines stay in the chats: `ended`, `next`, `left`, `stopped`, `made_group`, `cancelled` with `stop`, and the deleted `cant_go` and `stopped` lines. A build without plan 2 words an unknown event as no line (`chatRules.ts:236-237`);
    - the restored circles roll sets no flag, so a real roll writes an `admin` line again for each admin it carries (chat core's Decision 4);
    - the restored roll skips nobody, so a person who left after the end (their row kept) is carried again at the next roll (challenge NOTE 10);
    - people in a group's chat who are not Going or Maybe, or a host, lose it at once: the one-off rule applies to every chat again (challenge NOTE 10);
    - a group's messages and announcements in a cancelled week are no longer pushed (chat core's rule, H30) (B1);
    - the chat build's resbite pages keep working after this file: `readEvent` reads a missing `series_is_group` as "not a group" (I4).

- [ ] **Step 1: Failing SQL test, slice 2** (`chat-groups.sql`). Slice 2 has six rolled-back blocks, 2a to 2f. Each starts from `pg_temp.e6_cast()` (Task 1), so no block's roll or leave reaches another. Within a block the lines run in the order written, and each block names its rolls (challenge NOTE 11). The people beyond the cast: 07 is invited in the app (2a, 2b, 2e). 09, 10 and 11 are brought guests, rows made by hand under the flag with `brought_by` and level 2: 09 by 06, 10 and 11 by 03 (2b). 12 is Task 1's stand-in for the fold only.
  - Times inside one transaction are moved by hand, as `chat.sql` does. "5 minutes later" moves the line's `created_at` back 5 minutes. An `update` can't set `updated_at`, since `messages_touch` makes it `now()` (`chat_core.sql:62-72`), and the built search already accepts any row updated in the last 10 minutes.
  - An update by hand that would write a line sits between `set_config('resbite.system','roll',true)` and its reset (`chat.sql:12-16`). An update by hand whose test is that it writes nothing runs outside the flag.
  - **A roll is called only after that reset**, so it runs with the flag empty, as cron runs it. Right after it returns, the test asserts `current_setting('resbite.system', true) = 'roll'`, then resets the flag (I1). A roll that sets no flag fails here, and also on G-B6's "no `joined`" line, since every insert on a group writes `joined`.
```sql
-- 2a. Lines and replies, on Board game night unless named. No roll.
-- 03 answers declined: one line cant_go {actor: 03, user: 03}. 01 invites 07 in the app: one line joined {user: 07}.
-- S3: 07 declines within a minute of the invitation: two lines, joined and cant_go, the joined line unchanged.
--   07 answers accepted 5 minutes later: the cant_go line reads state 'deleted', the joined line stays,
--   chats.last_message_id is the joined line's id and last_message_at its created_at. 07 declines again: one new cant_go line, shown.
-- NOTE 4 (old states): move 07's new cant_go line 11 minutes back, then set 07's response to 'declined' again (by hand,
--   outside the flag): no new line, the line unchanged. Then from 'declined' to 'withdrawn' (the same way): no new line.
-- I2 (the 10 minutes): move 03's cant_go line 11 minutes back, then 03 answers accepted: the line stays 'sent', and no
--   line is written.
-- G-S2: on Film club, Cancel just this one: cancelled {stop: false} with starts_at and time_zone of the cancelled
--   occurrence. On Board game night, Cancel with p_stop_repeating: cancelled {stop: true}.

-- 2b. One roll, with 01 signed in (challenge NOTE 8). Before it, in this order:
--   01 invites 07 in the app. 09, 10 and 11 are made (rows by hand), and 11's response is 'declined' (I9).
--   06 leaves (leave_series as 06), so 09's bringer is not carried (G-N3).
--   03 answers declined (a cant_go line on the old occurrence, for I2 below).
--   01 cancels Film club just this one.
--   Board game night's and Film club's times are moved into the past under the flag, the flag is reset, and the roll runs.
-- I1: right after the roll, current_setting('resbite.system', true) = 'roll'. Reset it.
-- G-B6: the roll carries admin 02 and guests 03, 04, 05, 07, 09, 10 and 11 onto Board game night's new occurrence, and
--   writes no 'joined' line and no 'admin' line there.
-- NOTE 8: 'ended' {actor: null, title: 'Board game night'} on the old occurrence and 'next' {actor: null, plan_id,
--   starts_at, time_zone, place_label, place_tbd} on the new one, though 01 is signed in.
-- Film club: no 'ended' line on its cancelled occurrence, and a 'next' line on its new one with that occurrence's starts_at.
-- G-N3: 09 is carried with brought_by null. 10 keeps brought_by 03.
-- I9 (CO-Q1 "carried"): 11, brought by 03, who said Can't go, is carried, pending, with brought_by 03 and level 2.
-- I2 (this occurrence only): 03 answers accepted on the new occurrence, within 10 minutes of the old cant_go line: that
--   line stays 'sent', and no line is written.
-- I11, as 05 (pending on the new occurrence, not a host): chat_messages and chat_messages_since return the 'next' line
--   with no 'place_label' key and with place_tbd. chat_summary.last (that line) and my_chat_overview's last for the
--   series have no 'place_label' either. As 02 (an admin, pending there: a host) and as 03 (Going there): place_label is
--   the plan's.
--   01 changes the place on the new occurrence (change_plan_v4): as 05 the 'changed' line keeps what 'place' and has
--   no 'place_label'. As 03 it has the new label.
-- I6: the roll queued invited:<new occurrence>:<04> (circles :625). 04 leaves: that notice is gone. 01 invites 04 again
--   in the app (invite_contacts): one notice with that key, and its id is above the roll's.

-- 2c. Leaving while the occurrence runs, then one roll.
-- leave_series as 04: attendee row gone, leave stored, one line left {actor: 04, user: 04}, chat_member false, no outbox row.
-- G-N1: 04's personal link on the current occurrence (a private.invitations row claimed by 04, made at the start of
--   this block) is revoked: answering it afterwards is refused as after remove_guest.
-- Challenge NOTE 12: leave_series as 04 again: 42501 'Not in this group'.
-- leave_series as 02 (admin): 42501 'Hosts can''t leave'. As 01: 42501 'Owner can''t leave'.
--   As a guest of the one-off: 42501 'Not in this group'.
-- CH-P4 (challenge NOTE 12): 02 answers Can't go through respond, which ends the admin role (creating_a_resbite.sql:114).
--   leave_series as 02 then succeeds, with one line left {actor: 02, user: 02}.
-- The roll (times moved under the flag, the flag reset first): it carries neither 04 nor 02. 01 invites 04 again:
--   the leave is cleared and 04 is a member.

-- 2d. A leave after the end, then one roll.
-- G-N13: after Board game night's current occurrence ends (ends_at moved under the flag) and before the roll,
--   leave_series as 03: the leave is stored, 03's attendee row stays, chat_member(series, 03) false.
-- Challenge NOTE 3: series_is_group as 03 on that series: false. 03 can still read the occurrence but is no member.
-- S1 (plan 1 builds the audiences on chat_members): before the roll, 02 announces to going. Move that announcement's
--   created_at back 61 seconds, so plan 1's 'Too fast' doesn't answer the next one. 02 then announces to everyone.
--   No announcement outbox row for 03. chat_summary as 02: going and everyone both leave 03 out.
--   01 invites 03 again before the roll: 'already', no row inserted, the leave stays (Decision 2).
-- The roll (the flag reset first; the times were moved for G-N13) does not carry 03.
-- Challenge NOTE 12, a closed group, last in the block: Film club stopped by Edit (Doesn't repeat), then its end moved
--   49 hours back under the flag, so chat_open is false. leave_series as 04 there: allowed, one line
--   left {actor: 04, user: 04}, 04's row stays (the occurrence ended and wasn't cancelled), chat_member false.

-- 2e. Who sees the group. 01 invites 07 in the app, then one roll (times moved under the flag, the flag reset first),
--   so 07 and 05 are pending on the past occurrence and carried.
-- can_see_guests as 05 (pending) on the group's current occurrence: true. On the one-off: false. 05 reads 02's
--   display_name on the group.
-- request_connection from 03 to 05 (pending) on the group: 'requested'. On the one-off: 42501 'Not on this resbite'.
-- series_is_group as 03, with the series id read from the past occurrence: true.
-- G-S3: 05 leaves. On the past occurrence, where 05's row is pending: can_see_guests as 05 false, and
--   request_connection from 05 to 03 there: 42501 'Names required'. series_is_group as 05: false.
-- Challenge NOTE 12, removed rather than left: 01 removes 07 from the current occurrence (remove_guest). On the past
--   occurrence, where 07's row is pending: can_see_guests as 07 false.

-- 2f. Pushes in a cancelled week (P2-Q1, Decision 7, B1), through private.notification_recipient_eligible. No roll.
--   Each message is the first in its chat in this block, so the one-a-minute rule holds no notice back.
-- Board game night, Cancel just this one, then 03 sends a message and 02 announces to everyone. Before any roll, 04's
--   chat_message notice and 04's announcement notice are both eligible.
--   05 mutes the chat (set_chat_mute): 05's chat_message notice is not eligible, and 05's announcement notice is.
--   06 mutes the resbite (a plan_mutes row for the series): neither of 06's notices is eligible.
-- Film club, Cancel with p_stop_repeating, then move its stopped_at back 47 hours. 03 sends a message and 02 announces
--   to everyone: 04's two notices are both eligible. Move stopped_at back to 48 hours and one minute (chat_open false):
--   neither is.
-- The one-off: 03 sends a message, then 01 cancels the one-off: 04's notice is not eligible (H30; the one-off's rule stays).
```
- [ ] **Step 2: Concurrency script** `supabase/tests/local/leave-series-concurrency.sh`, in the shape of `decide-join-concurrency.sh` (G-S5). Chat core's `chat-send-concurrency.sh` (prefix `e9`) shows how a session signs in as a person (an `auth.sessions` row and `request.jwt.claims`) and cleans up its rows across sessions:
  - Seed a weekly plan that has just ended, its owner, admin 02 (a `plan_admins` row and a Going guest row), guest 03 (Going) and guest 04, each with a live grant. Ids use the hex prefix `e8`.
  - Roll first: session A runs `begin; select private.roll_repeating_plans(); select pg_sleep(1); commit;` as postgres. Session B calls `leave_series` as 04 once A holds the row lock (wait on `pg_stat_activity`, as the decide script does).
  - Expected after both: one new occurrence, no attendee row for 04 on it, a leave row for 04, and `chat_member(series, 04)` false.
  - Also: the new occurrence carries 02 and 03 with no `joined` line and no `admin` line (I1). Session A sets no flag of its own, so only the roll's own `set_config` can silence those lines. The check fails on a roll that doesn't set it.
  - Leave first, on a second seeded plan: session B holds the lock (`leave_series` in an open transaction with `pg_sleep`). The roll skips that plan (it returns 0). A second roll after B commits creates the occurrence without 04.
  - Add the script to `scripts/test-database.sh`'s full-mode list, after `decide-join-concurrency.sh`.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** section 2 and the rollback. Then the three `chat.sql` assertions this section breaks:
  - `chat.sql:2134-2142` compares the whole `cancelled` payload with `{actor}`: add `stop` (true: the c3 one-off has no rule), `starts_at` and `time_zone`;
  - this plan's roll writes `ended` and `next` on the weekly series in slice 1 (`chat.sql:322-325`). Slice 1's overview entry for it (`:558-559`, `last` null and `unread` false as 03) now reads the `next` line, unread for 03 since its actor is null. Slice 2's "Slices 1 and 2 wrote other lines" (`:1436-1440`, every system line since the transaction began) now lists them too;
  - the way-back block (`chat.sql:2243-2290`) creates a stand-in `private.series_leaves` to prove chat core's rollback refuses, which fails now that the table exists. Switch it on `to_regclass('private.series_leaves')` with psql's `\if`, as `circles-of-trust.sql:1735-1757` does for chat. With this plan applied: run chat core's rollback, expect "Run the chat groups rollback before the chat core rollback", and check nothing changed. Without it: the full run as built. Chat core's full rehearsal also runs in `20261111140000_chat_core.after.sql`, before this migration, in hosted-baseline mode.

  Checked and unchanged: `chat.sql`'s cancelled-plan eligibility block (`:1041-1054`) is on the c1 one-off, whose rule P2-Q1 keeps. Its weekly overview entry (`:558-559`) is read as 03 after 03 answered Going on the rolled occurrence (`:340-341`), so the `next` line keeps its `place_label` for 03 (Decision 11).
- [ ] **Step 5: Run** both modes (the four candidates, as in Task 1) → PASS. The rehearsal in `after.sql` runs inside a transaction that ends in `rollback`, as `20261110120000_connections.after.sql` does. It applies the rollback and proves:
  - each restored body equals its previous definition (`pg_get_functiondef`): chat core's eight, `notification_recipient_eligible` and `chat_row` among them, and the creating-a-resbite, follow-ups and circles ones. Chat core wrote most of its bodies with `create function`, so the comparison runs chat core's statement as `create or replace` and checks nothing changed: cut it from the file read through `:resbite_repo`, as `pg_temp.ch_source` does (`chat.sql:131-138`, `:2255-2259`). `notification_recipient_eligible` is `create or replace` in chat core already, as are the circles and follow-ups bodies;
  - `series_leaves`, `stopped_at`, the two triggers and the new functions (`chat_hide_line` and `chat_place_hidden` included) are gone, and `is_group` remains with every row false;
  - with a stand-in `private.blocks` table present, the rollback refuses with the message above and changes nothing.

  Record `sha256sum` of the migration and the rollback.
- [ ] **Step 6: Commit:** `"Groups: the group's lines, the roll, leaving, and who sees the group"`

### Task 3: The app's group model and words

**Files:**
- Modify: `mobile/src/domain/chatCopy.ts` and test, `mobile/src/domain/chatRules.ts` and test, `mobile/src/state/chatModel.ts` and test (`shownMessages`, `withEndedLine` for a stopped group), `mobile/src/state/chatFeed.ts` and test (the group wording, headings and labels of every row), `mobile/src/services/chat.ts` (`leave(series)`, error mapping) and test, `mobile/src/domain/eventPage.ts` and test (`EVENT_COPY.groupNotAnswered`, `showsNames`, `moreRows`, `peopleGroups`, `chatRow`), `mobile/src/services/rsvp.ts` (`readEvent` reads the group flag, and keeps the page when it can't), `mobile/src/state/useEvent.ts` (exposes `isGroup`, and keeps a group's Chat row after an answer)
- Create: `mobile/src/services/rsvp.test.ts` (none exists at `43f4416`; append it to `package.json`'s `test` chain). `readEvent` calls the app's client directly, so the test needs a seam. One option is the injected `rpc` shape `createChatGateway(rpc, deadline)` uses (`chat.ts:218`).

**Interfaces:**
- Consumes, as chat core built them:
  - `CHAT_COPY` (`mobile/src/domain/chatCopy.ts:4-85`; `announcementTo(a)` :23-24, `announcementLabel(a)` :67-68, `ended(title)` :57, `keep` :35);
  - in `chatRules.ts`:
    - `systemText(m, names, viewerId, group, title)` (:213-239, `group` unused so far);
    - `rowText(last, names, viewerId, group)` (:253-263, which already takes `group` and calls `systemText(…, group, "")`);
    - `messageLabel(m, names, viewerId, now, zone, sending?)` (:423-447, no group: `systemText(…, false, "")` and `announcementLabel`);
    - `dayLabel(iso, zone, now?)` (:51-59, the year when it isn't now's);
    - `headerLine(summary, now)` (:327-334), `defaultAudience(summary)` (:340) and `closedCard(summary, now?)` (:346-351);
    - the private `person`, `cleanText` and `oneLine` helpers (:110-140);
  - `chatFeed(items, ctx)` with its `FeedContext` and `FeedRow` (`mobile/src/state/chatFeed.ts:17-80`, :143-244);
  - `withPending(messages, queue)` (`chatModel.ts:135-141`) and `withEndedLine(items, summary, hasEarlier, now)` (:173-194);
  - `ChatSummary` and `chatErrorMessage` (`chat.ts:33-67`, :264-278);
  - `chatRow` and `chatRowLabel` (`eventPage.ts:246-271`);
  - the screen's `now`, `chat.serverNow()` (`useChat.ts:37-38`, `chat.tsx:153`);
  - `repeatLine` (`mobile/src/domain/whenText.ts:51`);
  - the circles plan's Task 5 `peopleGroups` as built: its inputs `bringerNames` (null until `plan_bringers` lands, with a fallback to the bringer's own visible row), `broughtLinks`, `unnamed` (the `UNNAMED_GUEST` placeholder), `Guest.broughtById`, `PersonRow.broughtByMe`, and a guest's "Invited, not answered yet" group of their own link rows and own pending in-app rows.
- Produces:
  - Plan 1's `ChatSummary` already declares `isGroup`, `stopped`, `repeatWeeks` and `members` (G-N6), and already types `repeatWeeks` as `1 | 2 | null` (`chat.ts:43`, :175). Plan 2 only changes their server values (confirmation NOTE 2). Nothing changes in the mapper.
  - `CHAT_COPY` adds (exact). The apostrophe is ’ (U+2019), as in every user-facing string of `CHAT_COPY` and `systemText` (`chatCopy.ts:42`, :47, :50; `chatRules.ts:225`; H37 Q7: "curly apostrophes"), and "Can’t go" as the answer control writes it (`mobile/src/domain/rsvp.ts:42`):
    - `toGroup: "To: everyone in the group, now and later"`, `groupChat: "Group chat"`;
    - `opensResbite: "Opens the resbite"`, the "Next one" button's hint (Task 4);
    - `audienceGroup: (n) => \`Everyone in the group · ${n}\``, `audienceGoingDay: (day, n) => \`Going this ${day} · ${n}\``, `announcementToGroup: (a, day) => a === "everyone" ? "ANNOUNCEMENT · TO EVERYONE IN THE GROUP" : \`ANNOUNCEMENT · TO GOING THIS ${day.toUpperCase()}\``, and for the screen reader `announcementLabelGroup: (a, day) => a === "everyone" ? "Announcement to everyone in the group" : \`Announcement to people going this ${day}\`` (confirmation NOTE 14);
    - `announcePlaceholderGroup: "Write an update for the group"` (CH-03, G-S7);
    - `groupEmptyHint: "Messages here reach everyone in the group."` (CH-07, G-S7);
    - `peopleInGroup: (n) => \`People in this group · ${n}\``, `groupHeader: (repeat, n) => \`${repeat} · ${n} in the group\``, `groupStoppedHeader: (day, n) => \`Last one · ${day} · ${n} in the group\`` (G-S7);
    - `leaveGroup: "Leave group"`, `leaveThisGroup: "Leave this group"`, `leaveQuestion: (title, day) => \`Leave ${title}? You’ll stop getting its ${day}s and its chat.\``;
    - `groupClosedOn: (day) => \`This group’s chat closed on ${day}.\``, `notInGroup: "You’re not in this group."`;
    - `hostsCantLeave: "To leave, step down first: change your reply to Can’t go."`, `ownerCantLeave: "You own this group, so you can’t leave it."` (G-N13).
  - `audienceOptions(summary)` in `chatRules.ts`, the sheet's two radios in order (G-S7). It replaces the two options the sheet builds inline today (`chat.tsx:1077-1080`). On a group: Everyone in the group, then Going this `<weekday>`. The weekday is the long one ("Thursday", as `repeatLine` writes it), from `startsAt` in `timeZone`, with an unknown zone read in the phone's, as `chatRules.ts` does everywhere (`zoneOr`, :42). On a one-off: plan 1's Going, then Everyone invited. Plan 1's `defaultAudience` already starts a group on `everyone` and a one-off on `going` (:340, K-N7).
  - `systemText(m, names, viewerId, group, title)` with `group` true. Names come from the shared `names` map through the built `person` helper: a null or missing name reads "Someone", and the viewer reads "You". Free text in a payload (`place_label`) is cleaned with `cleanText`, as the `changed` line's label is (:177, H18).
    - `cant_go` → "Sol can’t make it this week" ("You can’t make it this week"). The built one-off line is "Sol can’t make it" (:225);
    - `left` → "Sol left the group" ("You left the group");
    - `ended` → "<payload.title> ended", with `title` when the payload has none (G-S6). **Already built** for both kinds (:232-235), so plan 2 only tests it on a group;
    - `next` → "Next one: Thu 20 Nov · Ana's flat" (the place label as the host typed it), or "Next one: Thu 20 Nov · Place to be decided" when `place_tbd`. With no `place_label` in the payload (Decision 11: the server leaves it out for a reader who hasn't answered) or an empty one, and `place_tbd` false, it is "Next one: Thu 20 Nov". The day is `dayLabel(payload.starts_at, payload.time_zone)`, with no `now` and so no year: `systemText` takes no `now` (`chatRules.ts:213`), and `rowText` gains no parameter (challenge NOTE 2);
    - `changed` with no `place_label` is already worded without a place by the built `changedText` (`chatRules.ts:171-183`: "Ana changed the place", and "Ana changed the time and place · Thu 19:30"). Plan 2 only tests it on a group (Decision 11);
    - `joined` with `brought_by` → "Clara joined · brought by Pedro". **Already built** for both kinds (:219-223): the bringer is named only when they are the reader or the map names them;
    - `cancelled` with `stop` false → "Ana cancelled this Thursday", the long weekday from `payload.starts_at` in `payload.time_zone`. With `stop` true → "Ana cancelled the group" (G-S2). The built one-off line, "Ana cancelled the resbite" or with no actor "The resbite was cancelled" (:230-231), stays;
    - `stopped` → "Ana stopped repeating this · the last one is Thu 27 Nov" (G-N13), the day from `dayLabel(payload.starts_at, payload.time_zone)` with no `now` (challenge NOTE 2);
    - `made_group` → "Ana made this a group · everyone invited can read this chat" (G-N8).
  - A `system` row whose `state` is `deleted` is never shown (Decision 6). `shownMessages(messages: ChatMessage[]): ChatMessage[]` in `chatModel.ts` drops it. The screen today renders `chatFeed(withEndedLine(withPending(chat.messages, chat.pending), summary, chat.hasEarlier, now), …)` (`chat.tsx:301`); it becomes `withEndedLine(withPending(shownMessages(chat.messages), chat.pending), summary, chat.hasEarlier, now)`. `systemText` ignores `state` today, so `rowText` (:255) and `messageLabel` (:431-434) also give no line for it.
  - `rowText(last, names, viewerId, group)` already takes `group` (:253), and the Chat row already passes `summary.isGroup` (`eventPage.ts:263`). With `systemText`'s group wording the row reads the same (G-S6), with no new parameter. It cuts the line to one with `oneLine`, as built (H37 D1).
  - `messageLabel` is widened. It takes no group today and words every system line and announcement as a one-off's (:432, :443). It gains trailing `group = false` and `day = ""` (the long weekday) after `sending`, passes `group` to `systemText`, and reads an announcement with `announcementLabelGroup(audience, day)` on a group.
  - `chatFeed` is widened too. `FeedContext` (`chatFeed.ts:67-80`) gains `group: boolean` and `day: string`, filled from the summary. The three calls that pass `false` today (`systemText` at :181 and :194, and the heading `CHAT_COPY.announcementTo` at :213) and every `messageLabel` call pass the group, so a group's heading reads `announcementToGroup(audience, day)`. The pinned card's label (`chat.tsx:346`) passes it too.
  - `FeedRow` (`chatFeed.ts:17-65`) gains `{ type: "next"; key: string; text: string; label: string }`, which `chatFeed` gives every `next` line, old or new. Like the `change` row, it carries no plan id: the screen opens the summary's current `planId` (Decision 14, I5; Task 4). `payload.plan_id` never leaves the payload.
  - `headerLine(summary, now)` on a group: running → `groupHeader(repeatLine(startsAt, timeZone, repeatWeeks), members)`. With `stopped` → `groupStoppedHeader(dayLabel(startsAt, timeZone, now), members)` (G-S7). The built one-off lines and "Cancelled" (`!isGroup && status === "cancelled"`, :328) stay. Null when `repeatLine` is null or the start or zone can't be read, as built.
  - Plan 1's `closedCard(summary, now?)` (:346-351) gains the group case, still from `(isGroup, stopped, status)` only (G-N5). A group gives `{ line: groupClosedOn(dayLabel(closesAt, timeZone, now)), why: closedWhy }`. Today a group falls through to the one-off's "This chat closed on …", since only `!isGroup && cancelled` is singled out. With no close time it keeps the built `closedShort`. Plan 1's two one-off cards stay as they are.
  - Plan 1's `withEndedLine(items, summary, hasEarlier, now)` (K-S16) returns at once for any group today (`chatModel.ts:179`). That guard becomes `summary.isGroup && !summary.stopped`, so the computed separator also goes in for a stopped group whose `status` is not `cancelled`, at its current occurrence's end, by the built placement rules (:183-193). No roll writes `ended` for a group's last occurrence.
  - The chat screen's `now` stays `chat.serverNow()` (the server's clock, never stepping back, H29 and H41 I3) for every one of these, as built.
  - `EVENT_COPY.groupNotAnswered: "Not answered yet"`.
  - `showsNames(role, response, isGroup)` (built `showsNames(role, response)`, `eventPage.ts:154-156`): true for any role on a group.
  - `MoreRow` (`eventPage.ts:273`) gains `"leaveGroup"`. `moreRows(i)` (:278-290, an object) gains the fields `isGroup` and `chatOpen`. A guest of a group, whatever their reply, gets `leaveGroup` last while the chat is open. On an ended or cancelled page it is their only row: the built early `return []` for a page that isn't open (:279) gives way to it. `chatOpen` is the Chat row's summary, `event.chat?.open === true` (`useEvent.ts`, `chat`), so a failed or refused chat read hides Leave this group.
  - `chatRow` and `chatRowLabel` (`eventPage.ts:246-271`) carry the group. The open row's title, "Chat" today (`event.tsx`, `ChatRow`), and the label's first word become `groupChat` on a group. The closed row "Chat closed · N messages" and the hidden row (no summary, or closed with no message, K-S13) stay as built.
  - `peopleGroups(i)` gains `isGroup` (G-B5):
    - a guest on a group sees, after Going, Maybe and Can't go, a group titled `groupNotAnswered` holding every pending app invitee (`appInvite` rows), each once;
    - a bringer's own pending in-app rows sit in that group too, keeping the circles plan's status ("Invited in the app · brought by you") and `removeInvite` while open (confirmation S4);
    - the bringer's own link rows stay in the circles plan's "Invited, not answered yet" group. Other people's link rows (they carry phone numbers, which the server refuses to guests) and the waiting requests are never shown to a guest;
    - no row appears twice;
    - a pending member is askable on a group, so `connect` is offered while the state is `none`;
    - hosts see what they saw before;
    - a row whose `broughtById` is missing from `bringerNames` shows no "Brought by" line (G-N3).
  - `readEvent` (`mobile/src/services/rsvp.ts:126`) reads the group flag as part of the event (G-N13). After the plan row, `series_is_group({p_series})` runs beside the attendee and organizer reads, or alone for the owner. Any failure of that one call reads as `isGroup: false`, and the page is kept (I4). The call may fail because the function is missing after plan 2's rollback (PostgREST `PGRST202`), or for any other reason. The page then follows the one-off rules, which show less, never more. Every other part's failure still throws `eventUnavailable`, and the function's comment says which part is the exception. `EventSnapshot.isGroup: boolean` (`rsvp.ts:78`). On a group, `counts` stays null and `plan_people_counts` isn't called, since a pending member reads every guest row there.
  - `useEvent` exposes `isGroup` from the snapshot and uses it in its own two `showsNames` calls (`useEvent.ts:248`, :358). The other callers pass it: `showsNames` and `moreRows` in `event.tsx:152` and :166, and `peopleGroups` in `guests.tsx:122`. Two more uses in `useEvent`:
    - the snapshot an answer builds (`useEvent.ts:395-404`) keeps `isGroup` from the old one;
    - after a confirmed answer, the Chat row's re-read (`useEvent.ts:414`) passes `keepOnFailure = isGroup` in place of `false`. On a one-off an answer can move the person out of the chat, so a failed read hides the row. On a group it can't, so a failed read keeps the row as it was (challenge NOTE 6). A refusal (`isNotInChat`) still hides it (`useEvent.ts:190`).
  - `chatGateway.leave(series)`: `ChatGateway` (`chat.ts:77-91`) and `createChatGateway` (:218-242) gain `leave`, calling `leave_series` with `{p_series}`. `chatErrorMessage`'s 42501 branch (:267-271) maps `'Not in this group'` → `notInGroup`, `"Hosts can't leave"` → `hostsCantLeave`, `"Owner can't leave"` → `ownerCantLeave`. The server's messages keep the straight apostrophe, and anything else still falls back to `INVITE_COPY.offline` (:277).

- [ ] **Step 1: Failing tests:**
  - every new string, exactly;
  - each group `systemText`, with a name, with a null name ("Someone") and as the viewer ("You");
  - `systemText` of `ended` with `payload.title` "Board game night" → "Board game night ended";
  - `cancelled` with `{stop: false, starts_at: "2026-11-20T19:00:00Z", time_zone: "Europe/London"}` → "Ana cancelled this Thursday"; with `stop: true` → "Ana cancelled the group";
  - `stopped` with `starts_at` "2026-11-27T19:00:00Z" in Europe/London → "Ana stopped repeating this · the last one is Thu 27 Nov";
  - `rowText` of a `cant_go` line: `group` true → "Sol can’t make it this week", false → "Sol can’t make it" (U+2019, as built);
  - `messageLabel` of a `cant_go` line with `group` true → "Resbite: Sol can’t make it this week"; of an `everyone` announcement with `group` true and day "Thursday" → it starts "Announcement to everyone in the group";
  - `chatFeed` with `group: true, day: "Thursday"`: an announcement's heading is "ANNOUNCEMENT · TO GOING THIS THURSDAY" for `going`, and a `left` line reads "Sol left the group";
  - `audienceOptions`: on a group, "Everyone in the group · 9" then "Going this Thursday · 6"; on a one-off, "Going · 6" then "Everyone invited · 9";
  - `headerLine`: running → "Every Thursday · 9 in the group"; stopped → "Last one · Thu 27 Nov · 9 in the group";
  - `closedCard` for a stopped group gives "This group’s chat closed on Thu 27 Nov." with `closedWhy`, and plan 1's two one-off cases still hold;
  - `withEndedLine` for a stopped group past its end inserts the separator, and for a running group or a cancelled stopped one it does not;
  - `showsNames("guest","pending",true)` true, `showsNames("guest","pending",false)` false;
  - `moreRows`: a group guest gets `leaveGroup`, a one-off guest does not; an ended page with the chat open → `["leaveGroup"]`; the chat closed → no `leaveGroup`;
  - `peopleGroups` as a **guest** whose co-members are all pending, the state right after a roll (owner 01, admin 02, viewer 03, 04, 05, 06 pending): groups "Going · 1" (01) and "Not answered yet · 5", every member's name present, `connect` on 02, 04, 05 and 06 with state `none`, no `linkInvite` or `request` rows, and 6 app and owner rows, equal to the fixture's `members` (G-B5, G-S14);
  - S4: a bringer guest on a group with one brought pending app invitee and one brought link: the invitee appears once, under "Not answered yet", with "Invited in the app · brought by you" and `removeInvite`. The link appears under "Invited, not answered yet". No key appears twice, and the count of rows outside the link group still equals `members`;
  - the same fixture with `isGroup` false: only "Going · 1" (the one-off rule holds);
  - a guest brought by an id missing from `bringerNames`: no "Brought by" line;
  - `announcementLabelGroup("everyone", "Thursday")` → "Announcement to everyone in the group"; `("going", "Thursday")` → "Announcement to people going this Thursday";
  - `shownMessages` of [joined, cant_go with state `deleted`, a message] gives [joined, the message], and `rowText` and `messageLabel` of the deleted line give no line;
  - `chatRow` of a group summary: the open row's title is "Group chat" and its label starts "Group chat."; a closed group with messages still reads "Chat closed · N messages", and with none there is no row;
  - `readEvent` with a stubbed client: `series_is_group` is called with `{p_series}`, and `isGroup` true lands in the snapshot (I4):
    - a `series_is_group` that answers `{code: "PGRST202"}` (the function missing after plan 2's rollback) resolves with `isGroup: false` and the rest of the snapshot as read;
    - one that fails any other way (an offline answer) resolves the same way;
    - a failed attendee read still rejects with `eventUnavailable`;
  - `readEvent` as a not-answered group member (`isGroup` true, own response `pending`): `counts` is null and `plan_people_counts` is never called. As the same member on a one-off (`isGroup` false): it is called once (challenge NOTE 12);
  - `systemText` of `next` with no `place_label` key and `place_tbd` false, `starts_at` "2026-11-20T19:00:00Z" in Europe/London → "Next one: Thu 20 Nov". With `place_tbd` true → "Next one: Thu 20 Nov · Place to be decided". With `place_label` "Ana's flat" → "Next one: Thu 20 Nov · Ana's flat" (I11);
  - `systemText` of `changed {what: "place"}` with no `place_label`, `group` true → "Ana changed the place" (I11);
  - `chatFeed` of a `next` line whose `payload.plan_id` is not the summary's: one row `{type: "next"}` whose text is the line's words, and with no plan id key (I5).
- [ ] **Step 2: Run** each with `node --import tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5: Commit:** `"Groups: the app's words for a group"`

### Task 4: Group screens, Leave group, checks and record

**Files:**
- Modify: `mobile/app/chat.tsx`, `mobile/app/event.tsx` (More's Leave this group with the in-place confirm; the people row's names for a group; the Chat row's "Group chat"), `mobile/app/guests.tsx` (a guest's "Not answered yet" group), `mobile/app/(tabs)/plans.tsx` (the unread dot on a group member's invitation card, I3), `mobile/src/design/WhenSheet.tsx` (the When sheet's chat line; `planCopy.ts` is untouched, since P2-Q2 adds no copy), `mobile/scripts/verify-chat.mjs` (group scenarios), `mobile/scripts/verify-event.mjs`, `mobile/scripts/review-ui.mjs` (the invitation card's dot, beside the tile's at :660), `mobile/scripts/verify-planning.mjs` (the When sheet's line, beside its Every week check at :312-327), `qa/chat-release/README.md` (groups part), `knowledge-base/08-decisions.md`, `docs/implementation-status.md`

**Interfaces:**
- Consumes: Task 3; the chat screen as chat core built it (`mobile/app/chat.tsx`).
- Produces:
  - **The chat screen with `summary.isGroup`:**
    - the header from `headerLine` (`Bar`, :175). At accessibility text sizes its second line wraps to as many lines as it needs and never truncates (G-N7);
    - the field line `toGroup` in place of `toGoing` (`Composer`, :956);
    - the announcement sheet from `audienceOptions`, with `announcePlaceholderGroup` (`AnnounceSheet`, :1039-1113; its options are inline at :1077-1080 today);
    - an announcement card on a group is read as `announcementLabelGroup(audience, weekday)` and headed `announcementToGroup`, through `chatFeed`'s widened context (Task 3), so the screen reader matches "TO EVERYONE IN THE GROUP" (confirmation NOTE 14);
    - the owner alone: `nobodyGoing` with `groupEmptyHint` in place of `nobodyGoingHint` (`EmptyState`, :734-750, which gains the group);
    - the menu (:615-640): `peopleInGroup(members)` in place of `peopleInChat` (:625), and the red **Leave group** (`MenuRow destructive`) after Mute, for a member who is not a host, while open;
    - the closed card from `closedCard(summary, now)` (`ClosedCard`, :1009-1011; also the close's announcement at :424).
  - **The "Next one" line** is a button (`accessibilityRole="button"`, hint `CHAT_COPY.opensResbite`) (G-N7). It is `chatFeed`'s `next` row (Task 3), drawn like chat core's change chip (`chat.tsx:796-810`). Like the chip, it opens `/event?plan=<planId>` with `RowBody`'s `planId`, the summary's current occurrence (`chat.tsx:454`). That is the newest occurrence the reader may read, never the line's `payload.plan_id` (Decision 14, I5). When `planId` is empty (the mapper reads a missing `plan_id` as "", `chat.ts:169`), the tap re-reads the chat with `chat.replace()` and stays on it, never opening an event page that can't load. `RowBody` gains that one callback.
  - **A stopped group's last occurrence** shows the computed end separator from `withEndedLine` (Task 3).
  - **Leave group** asks `leaveQuestion(title, weekday)` in place, as Delete and Remove ask (`chat.tsx:670-697`), with a red "Leave group" and `CHAT_COPY.keep`. On success it returns to My resbites and refreshes. Leaving the screen runs its focus cleanup (:161-170), which clears `focusedChat`, so the push router stops skipping that series (H36). On failure the confirm stays open with the line from `chatErrorMessage`, and Leave group can be tapped again (G-N7).
  - **The event page:** More's "Leave this group" with the same confirm, names on the people row for a group, and the Chat row's first line `groupChat` (`ChatRow` in `event.tsx`, from `chatRow`). The confirm calls `chatGateway.leave(plan.series_id)` (I10):
    - on success the page goes to My resbites and refreshes it, as the chat screen does. The caller's guest row is gone, so the page could not be read again (`rsvp.ts:139-153`);
    - on failure the confirm stays open with `chatErrorMessage`'s line, and Leave group can be tapped again.
  - **My resbites** (`mobile/app/(tabs)/plans.tsx`, I3): the invitation card (:303-320) passes `dot={current.has(p.id) && unreadDot(overview?.chats[p.series_id])}`, as the tile does at :405. On a group, someone who hasn't answered is in the chat, so `my_chat_overview` lists it for them. `CoverCard` already ends a label with ", unread messages" when it draws the dot (`mobile/src/design/kit.tsx:358`), so the card's label needs no change of its own. A one-off invitee has no `chats` entry and gets no dot.
  - **The When sheet** (chat core's note, Decision 8): `PLAN_COPY.chatCloses`, "The chat closes 48 hours after the end time." (`planCopy.ts:35`), shows for every plan (`WhenSheet.tsx:115`). That isn't true while a group repeats. P2-Q2 is ruled: the line hides while Repeats is "Every week" or "Every 2 weeks" (`draft.repeatWeeks` not null), and shows as built otherwise. No new copy. A stopped group closes 48 hours after its last end, as the line says.

- [ ] **Step 1: Extend `verify-chat.mjs`.** Plan 1 already uses (g), (g2), (g3) and (g4) (`verify-chat.mjs:890`, :910, :1458), so this plan's labels are (gr1) to (gr9). Plan 3's (s1) to (s10) are clear of plan 1's (s) (:1211). Each scenario overrides the shared summary fixture (`verify-chat.mjs:228-249`, which reads `is_group: false, stopped: false`) through its `summary` argument.
  - (gr1) A group member who said Can't go this week still reads and writes, and sees "Sol can’t make it this week".
  - (gr2) The "Next one: Thu 20 Nov · Ana's flat" line is a button with the hint "Opens the resbite". With the summary's `plan_id` the new occurrence, it opens `/event?plan=<that id>`. An older "Next one" line, whose `payload.plan_id` is an occurrence the reader has no row on (a late joiner, I5), is the same button and opens the same current occurrence, never its own `payload.plan_id`. With a summary that has no `plan_id`, a tap opens no `/event` page, `chat_summary` and `chat_messages` are read again, and the chat stays on screen.
  - (gr3) Leave group calls `leave_series` with `{p_series}` and lands on My resbites.
  - (gr4) Leave group answered offline: the confirm stays, the error line shows, and a second tap calls `leave_series` again.
  - (gr5) The header reads "Every Thursday · 9 in the group". With `stopped` true it reads "Last one · Thu 27 Nov · 9 in the group".
  - (gr6) As host on a group, Announce opens with "Everyone in the group · 9" first and checked, then "Going this Thursday · 6", and the placeholder "Write an update for the group". The sent card is read as "Announcement to everyone in the group".
  - (gr7) A stopped group after its close shows "This group’s chat closed on Thu 27 Nov." and no field.
  - (gr8) After "Cancel just this one": "Ana cancelled this Thursday", no "ended" line, and the field is still there.
  - (gr9) With the chat open on "Sol can’t make it this week", a signal and `chat_messages_since` return that line with state `deleted`: the line leaves the screen, and "Sol joined" stays (Decision 6).

  `verify-event.mjs`:
  - More shows "Leave this group" on a group, not on a one-off.
  - A **guest** on a group whose co-members are all pending, with no answered row in the fixture, opens the people list. It shows every member's name under "Not answered yet", Connect on each, no phone number, and as many app and owner rows as the chat's `members` (G-B5, G-S14).
  - A bringer guest on a group sees their brought, unanswered person once, under "Not answered yet" with Remove, and their brought link under "Invited, not answered yet" (confirmation S4).
  - Leave from the resbite page (I10), mirroring (gr3): More → "Leave this group" → the confirm's "Leave group" calls `leave_series` with `{p_series}` once, and lands on My resbites. My resbites reads its plans again, and the group's tile is gone, since the stub no longer lists it after the leave.
  - Leave from the resbite page answered offline (I10), mirroring (gr4): the confirm stays open with the error line, and a second tap calls `leave_series` again.
  - A not-answered group member's page loads with the Chat row, then they answer Going and the re-read of `chat_summary` fails (challenge NOTE 6): the Chat row stays as it was. On a one-off, the same failure after an answer hides the row, as built.

  `review-ui.mjs` (I3), beside the tile's dot (:660): Jo's invitation becomes a group member's for one pass, behind a toggle like `overviewFails`, so the labels checked earlier hold. `overview.chats[invitation.series_id]` is `{unread: true, open: true, last, count}`. The invitation card draws the dot, and its label ends ", unread messages". With `unread` false it has neither.

  `verify-planning.mjs` (P2-Q2, Decision 8), in the When sheet check (:312-327): with Repeats "Doesn't repeat", "The chat closes 48 hours after the end time." shows. After "Every week" is picked, it is gone.
- [ ] **Step 2: Run** with Expo web → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run check`, `verify-chat.mjs`, `verify-event.mjs`, `review-ui.mjs` and `verify-planning.mjs` → PASS.
- [ ] **Step 5: Runbook** (groups part of `qa/chat-release/README.md`). Chat core wrote the runbook in parts, for plans 2 and 3 to extend (README:7). Its sections are fixed: what is built, Files and hashes, Checks made locally, the Rollout runbook's steps 0 to 8, Applied, Rollback, Known gaps and Not done here. Owner-run scripts are `! bash ~/<name>.sh`, written into the home directory from a block in the step. Each checks the file's sha256, runs from `${REPO:-$HOME/dev/resbite-app}`, and prints no secret, number or account id (README:178-183). The groups part goes into those sections:
  - **The header** (README:5-14): the Code line names `ch2-groups`. The two plan-1-alone bullets ("a repeating series follows the one-off rules", "the real weekly roll writes an `admin` line") become history once this plan ships with it.
  - **What is built:** a groups section in the same shape.
  - **Files and hashes** (README:73-87): this migration, its rollback and its before/after files, and the circles migration's sha256 (`04062e2b…`) as the body this plan's roll copies (I9).
  - **Checks made locally** (README:89-155):
    - the hosted-baseline command with all four candidates (Task 1, Step 5) and its PASS count;
    - the fingerprint replay from chat core's 464 objects, with what is added and changed;
    - the rollback back to 464.
  - **Step 0:** the owner questions, each with the default the build ships. The build doesn't wait for the answers. A different answer is a change to this plan before Step 2.
    - **G-QA, the place in a group's chat lines (I11, Decision 11).** "Next one: Thu 20 Nov · Ana's flat" and the place-change line are read by members who haven't answered, people a guest brought among them. Their resbite page shows them only the area. Default: the place is hidden from them, server-side. The alternative, the place for every member (the spec's wording), is one condition in `private.chat_row`.
    - **G-QB, resuming a stopped group (I8, Decision 12).** After "Doesn't repeat" and then "Every week" again, the chat would still say "Ana stopped repeating this · the last one is Thu 27 Nov". Default: that line is removed, with no new words. The alternative, a new line such as "Ana set this to repeat again", needs approved wording.
    - **G-QC, which is the circles runbook's CO-Q1 (I9, Decision 13), still open there.** Is a brought person who said Can't go carried to the next occurrence? Default: carried, as built, the only answer that fits "everyone in a group is in its chat whatever their reply". If the owner chooses the alternative, the circles roll changes before the circles migration, and this plan's roll copy is re-based on the new circles body and hash before Step 2.
    - Not owner questions: P2-Q1 to Q4 are ruled (Decisions 7 to 10). Their limits go under Known gaps.
  - **Step 1** (README:197-231): the bullet "With the roll job and chat core but not plan 2, the roll writes an `admin` line" now says this plan's roll sets the flag.
  - **Step 2** (README:233-272): after `ch1-apply.sh`, the owner runs `! bash ~/ch2-apply.sh`, in the same shape. It checks the hash, and its guard refuses unless chat core is applied (`public.messages` exists) and this plan isn't (`private.series_leaves` doesn't exist). It applies in one transaction and records with `supabase migration repair --status applied 20261111150000 --linked --yes`. The history then reads `23 | 20261111150000`. Never `supabase db push`.
  - **Step 3** (README:274-322):
    - the snapshot delta: `stopped_at` on `chats`, the backfilled `is_group` values, `series_leaves`, the new functions and the two triggers;
    - `ch1-after-checks.sh`'s `groups` reads 0 today ("plan 1 sets none", README:301). After this migration it equals the backfill's count: the series with any occurrence whose `repeat_weeks` or `repeats_from` is set;
    - a read in the SQL editor of the backfill cases: long-finished stopped groups closed, recently stopped ones open (G-B7);
    - the advisors: this plan adds no public table, so no new `rls_enabled_no_policy` line;
    - this migration's line for `supabase/tests/hosted-baseline/migrations.txt`.
  - **Step 4:** no sender change of this plan's own.
  - **Step 7** (README:361-418), the device checks:
    - a group carries its chat to next Thursday, and a Can't-go member stays in it;
    - after the roll, no "joined" and no "admin" line for anyone carried (G-B6);
    - right after the roll, a pending member sees every name;
    - Leave group, online and offline;
    - stopping the series gives the goodbye window and the "stopped repeating" line. Turning the repeat back on removes that line (I8);
    - after "Cancel this and stop repeating", a message from one phone is pushed to the other during the goodbye window (P2-Q1);
    - a member who hasn't answered this week reads "Next one: Thu 20 Nov" with no place (I11), and their invitation card on My resbites carries the unread dot (I3);
    - an old "Next one" line opens this week's resbite (I5);
    - Leave this group from the resbite page lands on My resbites (I10);
    - the group header at the largest text size.
  - **Rollback** (README:442-497): its full order and guarded chain already name this plan. Add this plan's steps with `! bash ~/ch2-rollback.sh`, in `ch1-rollback.sh`'s shape: the hash, one transaction, the fingerprint back to chat core's 464. Say what is lost: every leave record, every group flag's value, every stop time (G-N11). Say what the rollback file's header says besides:
    - the restored roll writes `admin` lines again, and carries a post-end leaver again;
    - not-answered and Can't-go members lose a group's chat at once;
    - a cancelled week's group messages are not pushed;
    - the chat build's resbite pages keep working after it, since `readEvent` reads a missing `series_is_group` as not a group (I4), so the app need not be rolled back for this file alone.
    And say to remove this migration's line from `migrations.txt`.
  - **Known gaps** (README:499-511): "The roll and plan 1 (Decision 4)" goes, since this plan's roll sets the flag. Add the gaps this plan accepts:
    - the post-end leaver who can't be re-invited until the roll (Decision 2);
    - P2-Q4: My resbites' dot can sit on an older tile until the list refreshes (Decision 10);
    - challenge NOTE 7: after "Cancel this and stop repeating", or for an owner who can no longer use the app, the header reads "Last one · Thu 27 Nov · 9 in the group" for a cancelled occurrence, and the closed card says chats close "48 hours after the resbite". Accepted, not worded apart;
    - challenge NOTE 5, not built: a not-answered group member has no "Mute this resbite" on the resbite page (`moreRows` gives them only Leave this group). "Mute chat" in the chat's menu is theirs;
    - challenge NOTE 9, not built: a message still "Sending…" when its author leaves stays queued, and is sent if they are back in the group within the hour;
    - Decision 11's limit: the plan row's `place_label` stays readable to a not-answered invitee through `plan_read`, as since GI1. The chat no longer hands it over.

  **Decisions log:** a "Chat groups (CH), <date>" section right after Chat core's (`knowledge-base/08-decisions.md:622-672`), one line each with no nested bullets, as H40 asked of Chat core's. It holds this plan's Decisions 1 to 14 (P2-Q1 to Q4 among them, as ruled), the owner questions G-QA, G-QB and G-QC with their defaults, the group lines' wording and the Leave confirm. Chat core's lines that point to plan 2 now point to that section: CH-D1, CH-D3, CH-D4, CH-P2, CH-P4, CH-P5, CH-P15 and CH-R4 ("until plan 2's roll sets its flag…"), and CH-R8.
- [ ] **Step 6: Full check** (three commands) → PASS.
- [ ] **Step 7: Commit:** `"Groups: the screens, leaving, and the record"`
