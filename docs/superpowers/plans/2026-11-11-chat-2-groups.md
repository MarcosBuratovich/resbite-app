# Groups Implementation Plan (chat plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repeating resbite becomes a group: one chat that carries from week to week, everyone in the group in it whatever this week's reply, a goodbye window when the series stops, a way to leave, and the group's people visible to every member.

**Architecture:** One migration, in two sections, sets plan 1's group flag on `public.chats` and keeps it sticky, and adds a stop time and a leave record per series. It redefines the chat's membership and closing rules, two of plan 1's chat-line trigger functions, `can_see_guests`, `request_connection`, `chat_summary` and the roll for groups. It adds `leave_series`, `series_is_group` and `group_stopped`, and the "ended", "Next one", "left", "stopped repeating" and "made this a group" lines. The roll sets the shared roll flag, so it writes no line for the people it carries. The app learns the group wording, the audiences' labels, the stopped header, Leave group, and names for members who have not answered, with the group flag read as part of the event.

**Tech Stack:** as chat plan 1.

**Spec:** `docs/superpowers/specs/2026-11-10-groups-and-chat-design.md` (CH-D1–D3, CH-P1–P6, P15, P19, P21, rules 1 and 1a). CH-P20 (the roll fix) shipped earlier in the follow-ups plan.

**Branch:** `ch2-groups` from `main` after chat plan 1 is merged. Ships in the same release as plans 1 and 3.

**Tasks:** 4.

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
- **Shared interfaces** are the rulings' table (`.superpowers/sdd/challenges/chat-rulings.md`), verbatim. Where plan 1's text differs, the table wins.
- Every chat-line trigger function this plan defines or redefines writes nothing when `current_setting('resbite.system', true)` is `roll` or `deletion`. The roll writes `ended` and `next` itself, on purpose, through `private.chat_system_line`.
- System lines store `author_id null` and `payload.actor`. Every other person in a payload is a uuid.
- A new table revokes all from `public, anon, authenticated, service_role`. A new function revokes execute from the same four before its explicit grants (K-S5).

## Decisions this plan makes

1. **Any way back in clears a leave** (G-N1). The trigger clears it on any attendee insert, as Review Focus 6 expects. An old personal link would otherwise let a leaver back in by answering Can't go, so `leave_series` revokes the leaver's personal links on the current occurrence, as `remove_guest` does.
2. **The leave record is only the roll's skip list** (G-S5). Membership of a group is the hosts and the attendee rows of the current occurrence. One exception: someone who leaves after the current occurrence ended keeps their row, a real attendance, and is out of the chat at once (G-N13). Such a leaver can't be re-invited until the roll. `invite_contacts` answers `already` for the row and inserts nothing, so the leave stays, and the roll then skips them (confirmation NOTE 15).
3. **Two new system lines.** Edit → "Doesn't repeat" writes "Ana stopped repeating this · the last one is Thu 27 Nov" (G-N13). A one-off with messages that becomes a group writes "Ana made this a group · everyone invited can read this chat" (G-N8). The spec has neither.
4. **A group stops when its owner can no longer use the app** (G-S4). The roll skips such a plan, so `stopped` counts an owner who is not `user_eligible`, and the chat closes 48 hours after the last end.
5. **The roll drops a "brought by" that points outside the group** (G-N3). A carried row whose bringer is not carried gets `brought_by = null`.
6. **On a group, a reply flip changes one fact at a time** (confirmation S3, CH-R-A5). A `cant_go` line coalesces only into that person's `cant_go` line from the last 10 minutes. A `joined` line is never rewritten, since membership did not change. A change back to Going or Maybe within 10 minutes of the person's `cant_go` line deletes that line. It takes `state = 'deleted'`, so the existing signal carries the deletion to open screens.

## Review Focus

1. **The host turns "every Thursday" off before the first Thursday.** Expected: the series stays a group (CH-P1). The chat says "Ana stopped repeating this · the last one is Thu 27 Nov", keeps everyone, and closes 48 hours after that occurrence's end. Test in Task 1.
2. **"Cancel this and stop repeating", on a first occurrence or days after Edit stopped the series.** Expected: the chat closes 48 hours after the cancellation, never at once (G-S1). Test in Task 1.
3. **The roll creates next Thursday.** Expected: "Board game night ended" on the old occurrence and "Next one: Thu 20 Nov · Ana's flat" on the new one. No "joined" or "admin" line for anyone carried (G-B6). After "Cancel just this one", "Ana cancelled this Thursday" and no "ended" line (G-S2). Test in Task 2.
4. **A member leaves while the roll runs.** Expected: they are not carried, and never end up with a row but outside the chat (G-S5). Test in Task 2, by the concurrency script.
5. **A member who has not answered, right after a roll, opens the people list.** Expected: every member's name, with Connect (CH-P21, G-B5). Someone who left or was removed sees the one-off rule on every occurrence (G-S3). Tests in Tasks 2, 3 and 4.
6. **A member who left is invited again (by a host or a circle).** Expected: the leave is cleared, and they are back in the group and its chat. Their old personal link no longer answers (G-N1). Test in Task 2.
7. **The owner can no longer use the app, and hosted data from before the release.** Expected: the chat closes 48 hours after the last end (G-S4). Long-finished stopped groups come out closed, and recently stopped ones get their 48 hours (G-B7). Tests in Task 1 and its `after.sql`.
8. **A group member says Can't go, then Going again a few minutes later.** Expected: "Sol can't make it this week" goes for everyone, open screens included, and an earlier "Sol joined" stays (Decision 6). Test in Task 2.

---

### Task 1: Migration section 1: the group flag, membership, closing and the summary

**Files:**
- Create: `supabase/migrations/20261111150000_chat_groups.sql` (section 1), `supabase/tests/chat-groups.sql` (slice 1; add it to `supabase/tests/hosted-baseline/tests.txt`), `supabase/tests/hosted-baseline/20261111150000_chat_groups.before.sql`, `.after.sql`
- Modify: `supabase/tests/chat.sql` (plan 1's weekly-series membership assertions, Step 3)

**Interfaces:**
- Consumes: plan 1's `public.chats` with its `is_group boolean not null default false`, `private.chat_is_group(p_series)`, `private.current_occurrence`, `private.chat_member`, `private.chat_members`, `private.chat_closes_at`, `private.chat_open`, `private.chat_system_line`, `public.chat_summary`; `private.plan_end`, `private.user_eligible`, `private.is_host`, `private.can_read_plan`.
- Produces:
  - `public.chats` gains `stopped_at timestamptz null`. Plan 1 already creates `is_group boolean not null default false` and never sets it true (CH-R-A6). This plan adds no `is_group` column and no function named `chat_is_group`. It sets the flag through the backfill and `plans_group_flag`, and every group test below reads it through plan 1's `private.chat_is_group`.
  - Backfill, in the migration:
    - `is_group = true` for every series with an occurrence whose `repeat_weeks` is not null or whose `repeats_from` is not null.
    - `stopped_at = least(now(), private.plan_end(current.starts_at, current.ends_at))` for every group whose current occurrence has `repeat_weeks` null, cancelled or not (G-B7). At `3b5be48`, `public.plans` holds no cancellation or change time (only `created_at`, `version` and `guest_note_at`), so the end stands in for it.
    - A long-finished stopped group comes out closed. A group stopped recently, or cancelled ahead of its date, stays open until its 48 hours pass.
    - A series whose only occurrence lost its rule before the release can't be told from a one-off, and stays one. Its chat has no messages, since chat ships in this release.
  - `private.series_leaves (series_id uuid not null, user_id uuid not null references public.profiles(id) on delete cascade, left_at timestamptz not null default now(), primary key (series_id, user_id))`. RLS on, no policies, all revoked from the four roles.
  - Trigger `attendees_clear_leave` after insert on `public.attendees`, function `private.attendees_clear_leave()`: deletes the leave of the row's user for the plan's series (Decision 1). No grants.
  - `private.group_stopped(p_series uuid) returns boolean`: `is_group`, and either `stopped_at` is set or the current occurrence's owner is not `private.user_eligible` (G-S4). No grants.
  - Trigger `plans_group_flag` after insert or update of `repeat_weeks, status` on `public.plans`, function `private.plans_group_flag()`. It acts only when the row is its series' current occurrence. On update it compares OLD with NEW (G-N4).
    - An insert with `repeat_weeks` not null, or an update from null to not null: `is_group = true` and `stopped_at = null`.
    - An update into `status = 'cancelled'` with `new.repeat_weeks` null ("Cancel this and stop repeating"): `stopped_at = now()`, overwriting any earlier value (G-S1).
    - An update from not null to null with `status` still `active` (Edit → "Doesn't repeat"): `stopped_at = coalesce(stopped_at, now())`.
    - `is_group` never goes back to false (CH-P1).
    - It writes the `chats` row by upsert (`insert … on conflict (series_id) do update`), so it never depends on firing after plan 1's `plans_chat_row` (G-N4).
    - Its lines go through `private.chat_system_line`, never while the roll or deletion flag is set:
      - `made_group {actor}` when `is_group` turns true on a chat whose `message_count` is above 0 (G-N8);
      - `stopped {actor, plan_id, starts_at, time_zone}` on Edit → "Doesn't repeat", with the current occurrence's id, start and zone (G-N13).
  - `private.chat_member(p_series, p_user)` redefined. On a group: a host of the current occurrence, or anyone with an attendee row on it, whatever the reply (G-S5). One exception, not a member: a leave exists for (series, user) and the current occurrence has ended (Decision 2). One-offs keep plan 1's rule. `private.chat_members` is not redefined, since it filters by this function.
  - `private.chat_closes_at(p_series)` redefined, for a group:
    - null while `private.group_stopped(p_series)` is false (it never closes while the series runs);
    - `stopped_at + 48 h` when the current occurrence is cancelled and `stopped_at` is set;
    - else `private.plan_end(current) + 48 h` (stopped by Edit, or an owner who may no longer use the app).
    - One-offs keep plan 1's rule.
  - `private.chat_open(p_series)` redefined, for a group: `chat_closes_at` null means open, whatever the current occurrence's status, so "Cancel just this one" keeps the chat open (CH-P15). Else `now() < chat_closes_at`. One-offs keep plan 1's rule. The app decides "closed" only from `open` (G-N5).
  - `public.chat_summary` redefined, copied from plan 1's latest body. It fills `is_group` from `chats.is_group` and `stopped` from `private.group_stopped`, which plan 1 returns as false. `repeat_weeks` and `members` stay as plan 1 defines them, and `members` covers a group through this plan's `chat_member`. Plan 3 copies this body.
  - `public.series_is_group(p_series uuid) returns boolean`, with `private.series_is_group`: the series' `is_group`, and false unless the caller `private.can_read_plan` the current occurrence. Execute revoked from the four roles, granted to `authenticated` only.

- [ ] **Step 1: Failing SQL test, slice 1** (`supabase/tests/chat-groups.sql`; ids use the hex prefix `e6` and emails `g2-…@resbite-test.invalid`, one rolled-back block per slice as `supabase/tests/connections.sql` does; owner 01, admin 02, guests 03 Going, 04 Maybe, 05 pending, 06 Can't go, 08 stranger; a weekly plan "Board game night" and a one-off copy of the same people):
```sql
-- is_group true after create_plan_v4 with repeat_weeks 1. The one-off: false.
-- change_plan_v4 with repeat_weeks null on the weekly plan: is_group still true, stopped_at set, chat_closes_at = end + 48 h,
--   and one line stopped {actor: 01, plan_id, starts_at, time_zone} with author_id null.
-- A one-off with one message, then change_plan_v4 with repeat_weeks 1: is_group true, one line made_group {actor: 01}.
--   A one-off with no messages made weekly: no made_group line.
-- chat_member true for 01..06 on the group. On the one-off: 05 and 06 false.
-- A row on the running current occurrence plus a leave inserted by hand: chat_member true (no leave test while it runs).
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
```
- [ ] **Step 2: Run** `bash scripts/test-database-docker.sh` → FAIL (`chats.stopped_at` missing).
- [ ] **Step 3: Implement** section 1. Plan 1's `supabase/tests/chat.sql` asserts one-off rules on its weekly fixture (plan 1's Decision 4). That series is now a group: change those assertions to expect every attendee row a member, and keep the one-off matrix on the one-off fixture. Plan 1's CH-R-A6 tests change too (confirmation 2, SHOULD 1). Under this plan the weekly series reads `is_group` true, so that assertion expects true. Drop plan 1's block that sets `is_group` by hand on the one-off, which proves plan 1 alone. This plan's slice 1 audiences and the S1 test in Task 2 replace it.
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
- [ ] **Step 5: Run** both modes (the hosted-baseline mode takes plan 1's candidates, then this migration) → PASS.
- [ ] **Step 6: Commit:** `"Groups: the group flag, who is in a group's chat, and when it closes"`

### Task 2: Migration section 2: the group lines, the roll, leaving and visibility

**Files:**
- Modify: `supabase/migrations/20261111150000_chat_groups.sql` (section 2), `supabase/tests/chat-groups.sql` (slice 2), `scripts/test-database.sh` (run the new script with the other concurrency scripts in full mode), `supabase/tests/hosted-baseline/20261111150000_chat_groups.after.sql` (the rehearsal)
- Create: `supabase/tests/local/leave-series-concurrency.sh`, `supabase/rollback/20261111150000_chat_groups.rollback.sql`

**Interfaces:**
- Consumes: Task 1; plan 1's `private.attendees_chat_lines()` and `private.plans_chat_lines()`; the latest `private.can_see_guests` (`20261031120000_creating_a_resbite.sql:621`), `private.request_connection` (the follow-ups migration, `20261111120000_connections_follow_ups.sql`), `private.roll_repeating_plans` (the circles migration, `20261111130000_circles_of_trust.sql`); the personal-link revokes of the latest `private.remove_guest`.
- Produces:
  - `private.attendees_chat_lines()` redefined, copied from plan 1 with its flag check. On a group (Decision 6, confirmation S3):
    - an insert writes `joined {actor, user, brought_by?}`. A `joined` line is never rewritten;
    - a change into `declined` or `withdrawn` writes `cant_go {actor, user}`, or updates in place that person's shown `cant_go` line from the last 10 minutes;
    - a change back into `accepted` or `maybe` within 10 minutes of that person's shown `cant_go` line deletes the line. It sets `state = 'deleted'`, so `updated_at` moves and `messages_signal` fires. When `chats.last_message_id` pointed at it, it moves back to the series' newest row still shown, and `last_message_at` moves with it to that row's `created_at` (confirmation 2, NOTE 4);
    - nothing else writes a line.

    One-offs keep plan 1's transitions and its 10-minute rule (K-S2). The roll writes nothing because it runs under the roll flag (G-B6). Nothing infers "by the roll" from `repeats_from` any more (G-N2).
  - `private.plans_chat_lines()` redefined, copied from plan 1. The `cancelled` payload becomes `{actor, stop, starts_at, time_zone}`, where `stop` is `new.repeat_weeks is null` and the two others are the cancelled occurrence's (G-S2). Everything else as plan 1.
  - `private.plan_admins_chat_lines()` is not redefined. Plan 1's flag check already silences it when the roll re-inserts an admin (G-B6).
  - `private.roll_repeating_plans()` redefined, copied from the circles version. The only changes:
    - first statement: `perform set_config('resbite.system','roll',true)`;
    - the carried-attendee insert skips users with a `series_leaves` row for the series;
    - after that insert, a carried row whose `brought_by` has no carried row on the new occurrence gets `brought_by = null` (G-N3);
    - after the new occurrence is in, two lines through `private.chat_system_line`, both with `actor` null:
      - `ended {actor, title}` on the previous occurrence (`plan_id = p.id`, `title = p.title`), only when `p.status <> 'cancelled'` (G-S2, G-S6);
      - `next {actor, plan_id, starts_at, time_zone, place_label, place_tbd}` on the new occurrence.
  - `public.leave_series(p_series uuid) returns void`, with `private.leave_series`:
    - resolves the current occurrence and takes it `for update`, the row lock the roll holds. It then resolves "current" again, and locks the new one when the roll created it meanwhile (G-S5);
    - a group and a member, else `42501 'Not in this group'`;
    - the owner gets `42501 'Owner can''t leave'`, an admin `42501 'Hosts can''t leave'`;
    - inserts the leave, `on conflict do update set left_at = now()`;
    - revokes the caller's personal links on the current occurrence as `remove_guest` does: `private.invitations` claimed by the caller and `private.phone_invitations` for the caller (G-N1);
    - deletes the caller's attendee row on the current occurrence, unless that occurrence has ended and was not cancelled. Then the row stays, a real attendance (G-N13), and `chat_member` already leaves them out (Decision 2);
    - writes `left {actor, user}`, both the caller. No outbox.
    - Execute revoked from the four roles, granted to `authenticated` only.
  - `private.can_see_guests(p_plan)` redefined, copied from `creating_a_resbite.sql:621`. Its existing tests come first. A group branch comes last: the plan's series `is_group`, the caller has an attendee row on the plan (any reply), and `private.chat_member(series, auth.uid())` holds now (G-S3). Someone who left or was removed falls back to the one-off rule on every occurrence. `can_read_profile` and the avatar policy follow through it.
    - Cost (G-S3): `can_see_guests` runs per row in `attendee_read` and inside `can_read_profile`'s loop over plans. Hosts and answered guests never reach the group branch. `chat_member` resolves the current occurrence once, through `plans_series_idx` and `plans_repeats_from_key`. A pending member's people list pays one such lookup per row read, accepted for groups of tens.
  - `private.request_connection` redefined, copied from the follow-ups version with its `detail` kept. On a group the target may be any attendee, pending included. This replaces the CH-P21 comment at its target check. The caller still passes `can_see_guests` first, so a leaver asking from a past occurrence gets `42501 'Names required'`. Plan 3 copies this body.
  - Rollback, `supabase/rollback/20261111150000_chat_groups.rollback.sql`, in this order:
    - refuse while plan 3 is applied (`private.blocks` exists) with `'Run the chat safety rollback before the chat groups rollback'`, as the connections rollback guards its order (G-N11);
    - drop the triggers `plans_group_flag` and `attendees_clear_leave`;
    - restore plan 1's `attendees_chat_lines()`, `plans_chat_lines()`, `chat_member`, `chat_closes_at`, `chat_open` and `chat_summary`;
    - restore `creating_a_resbite`'s `can_see_guests`, the follow-ups `request_connection` and the circles `roll_repeating_plans`;
    - drop `leave_series` and `series_is_group` in both schemas, `group_stopped`, `plans_group_flag()` and `attendees_clear_leave()`;
    - drop `series_leaves` and the `stopped_at` column;
    - set `is_group = false` on every `chats` row, leaving the column to plan 1, whose rollback drops it with the table (CH-R-A6). Plan 1 sets the flag true nowhere, so its audiences then read as before.

    Its header says what is lost: every leave record, every group flag's value and every stop time. It also says to roll back in reverse order only, plan 3's first, because plan 3 copies this plan's `request_connection` and `chat_summary` (G-N11).

- [ ] **Step 1: Failing SQL test, slice 2** (`chat-groups.sql`, Task 1's fixture). A test that calls the roll inside its own transaction resets the flag afterwards (`select set_config('resbite.system', '', true)`).
```sql
-- 03 answers declined on the group: one line cant_go {actor: 03, user: 03}. 07 invited in the app: one line joined {user: 07}.
-- S3: 07 declines within a minute of the invitation: two lines, joined and cant_go, the joined line unchanged.
--   07 answers accepted 5 minutes later: the cant_go line reads state 'deleted', the joined line stays,
--   chats.last_message_id is the joined line's id and last_message_at its created_at. 07 declines again: one new cant_go line, shown.
-- Cancel with p_stop_repeating: line cancelled {stop: true}. On a second weekly series, Cancel just this one: cancelled {stop: false},
--   with starts_at and time_zone of the cancelled occurrence.
-- Roll after Cancel just this one: no 'ended' line on the cancelled occurrence, a 'next' line on the new one with its starts_at.
-- Roll after an ended occurrence: 'ended' {actor: null, title: 'Board game night'} on the old plan, 'next' on the new one.
-- G-B6: the roll carries admin 02 and guests 03..07: no 'joined' line and no 'admin' line on the new occurrence.
-- G-N3: 09 brought by 06, then 06 leaves before the roll: 09 is carried with brought_by null.
--   10 brought by 03, who is carried: 10 keeps brought_by 03.
-- leave_series as 04: attendee row gone, leave stored, one line left {actor: 04, user: 04}, chat_member false, no outbox row.
-- G-N1: 04's personal link on the current occurrence is revoked: answering it afterwards is refused as after remove_guest.
-- The roll does not carry 04. 01 invites 04 again: the leave is cleared and 04 is a member.
-- G-N13: after the current occurrence ends (move ends_at), before the roll, leave_series as 03: the leave is stored,
--   03's attendee row stays, chat_member(series, 03) false. The roll then does not carry 03.
-- S1 (plan 1 builds the audiences on chat_members): before that roll, 02 announces to going. Move that announcement's
--   created_at back 61 seconds, so plan 1's 'Too fast' doesn't answer the next one. 02 then announces to everyone.
--   No announcement outbox row for 03. chat_summary as 02: going and everyone both leave 03 out.
--   01 invites 03 again before the roll: 'already', no row inserted, the leave stays (Decision 2).
-- leave_series as 02 (admin): 42501 'Hosts can''t leave'. As 01: 42501 'Owner can''t leave'.
--   As a guest of the one-off: 42501 'Not in this group'.
-- can_see_guests as 05 (pending) on the group: true. On the one-off: false. 05 reads 02's display_name on the group.
-- G-S3: 04 has left. On a past occurrence where 04's row is pending: can_see_guests as 04 false,
--   and request_connection from 04 to 03 there: 42501 'Names required'.
-- request_connection from 03 to 05 (pending) on the group: 'requested'. On the one-off: 42501 'Not on this resbite'.
-- series_is_group as 04 after leaving: false. As 03, with the series id read from a rolled past occurrence: true.
```
- [ ] **Step 2: Concurrency script** `supabase/tests/local/leave-series-concurrency.sh`, in the shape of `decide-join-concurrency.sh` (G-S5):
  - Seed a weekly plan that has just ended, its owner, and guest 04 with a live grant. Ids use the hex prefix `e8`.
  - Roll first: session A runs `begin; select private.roll_repeating_plans(); select pg_sleep(1); commit;` as postgres. Session B calls `leave_series` as 04 once A holds the row lock (wait on `pg_stat_activity`, as the decide script does).
  - Expected after both: one new occurrence, no attendee row for 04 on it, a leave row for 04, and `chat_member(series, 04)` false.
  - Leave first, on a second seeded plan: session B holds the lock (`leave_series` in an open transaction with `pg_sleep`). The roll skips that plan (it returns 0). A second roll after B commits creates the occurrence without 04.
  - Add the script to `scripts/test-database.sh`'s full-mode list, after `decide-join-concurrency.sh`.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** section 2 and the rollback. If plan 1's `chat.sql` compares a whole `cancelled` payload, add `stop`, `starts_at` and `time_zone` to it.
- [ ] **Step 5: Run** both modes → PASS. The rehearsal in `after.sql` runs inside a transaction that ends in `rollback`, as `20261110120000_connections.after.sql` does. It applies the rollback and proves:
  - each restored body equals its previous definition (`pg_get_functiondef`);
  - `series_leaves`, `stopped_at`, the two triggers and the new functions are gone, and `is_group` remains with every row false;
  - with a stand-in `private.blocks` table present, the rollback refuses with the message above and changes nothing.

  Record `sha256sum` of the migration and the rollback.
- [ ] **Step 6: Commit:** `"Groups: the group's lines, the roll, leaving, and who sees the group"`

### Task 3: The app's group model and words

**Files:**
- Modify: `mobile/src/domain/chatCopy.ts` and test, `mobile/src/domain/chatRules.ts` and test, `mobile/src/state/chatModel.ts` and test (`withEndedLine` for a stopped group), `mobile/src/services/chat.ts` (summary fields, `leave(series)`, error mapping) and test, `mobile/src/domain/eventPage.ts` and test (`EVENT_COPY.groupNotAnswered`, `showsNames`, `moreRows`, `peopleGroups`), `mobile/src/services/rsvp.ts` (`readEvent` reads the group flag) and `rsvp.test.ts`, `mobile/src/state/useEvent.ts` (passes `isGroup` on)

**Interfaces:**
- Consumes: plan 1's `CHAT_COPY`, `systemText`, `rowText`, `dayLabel`, `headerLine`, `defaultAudience`, `closedCard`, `withEndedLine`, `ChatSummary`, `chatErrorMessage`; `repeatLine` (`mobile/src/domain/whenText.ts:51`); the circles plan's Task 5 `peopleGroups`: its input `bringerNames` (C-R7), `Guest.broughtById`, and a guest's "Invited, not answered yet" group of their own link rows and own pending in-app rows; plan 1's `announcementLabel`.
- Produces:
  - Plan 1's `ChatSummary` already declares `isGroup`, `stopped`, `repeatWeeks` and `members` (G-N6). Plan 2 only changes their server values, and types `repeatWeeks` as `1 | 2 | null` (confirmation NOTE 2).
  - `CHAT_COPY` adds (exact):
    - `toGroup: "To: everyone in the group, now and later"`, `groupChat: "Group chat"`;
    - `audienceGroup: (n) => \`Everyone in the group · ${n}\``, `audienceGoingDay: (day, n) => \`Going this ${day} · ${n}\``, `announcementToGroup: (a, day) => a === "everyone" ? "ANNOUNCEMENT · TO EVERYONE IN THE GROUP" : \`ANNOUNCEMENT · TO GOING THIS ${day.toUpperCase()}\``, and for the screen reader `announcementLabelGroup: (a, day) => a === "everyone" ? "Announcement to everyone in the group" : \`Announcement to people going this ${day}\`` (confirmation NOTE 14);
    - `announcePlaceholderGroup: "Write an update for the group"` (CH-03, G-S7);
    - `groupEmptyHint: "Messages here reach everyone in the group."` (CH-07, G-S7);
    - `peopleInGroup: (n) => \`People in this group · ${n}\``, `groupHeader: (repeat, n) => \`${repeat} · ${n} in the group\``, `groupStoppedHeader: (day, n) => \`Last one · ${day} · ${n} in the group\`` (G-S7);
    - `leaveGroup: "Leave group"`, `leaveThisGroup: "Leave this group"`, `leaveQuestion: (title, day) => \`Leave ${title}? You'll stop getting its ${day}s and its chat.\``;
    - `groupClosedOn: (day) => \`This group's chat closed on ${day}.\``, `notInGroup: "You're not in this group."`;
    - `hostsCantLeave: "To leave, step down first: change your reply to Can't go."`, `ownerCantLeave: "You own this group, so you can't leave it."` (G-N13).
  - `audienceOptions(summary)` in `chatRules.ts`, the sheet's two radios in order (G-S7). On a group: Everyone in the group, then Going this `<weekday>`, the weekday from `startsAt` in `timeZone`. On a one-off: plan 1's Going, then Everyone invited. Plan 1's `defaultAudience` already starts a group on `everyone` and a one-off on `going` (K-N7).
  - `systemText(m, names, viewerId, group, title)` with `group` true. Names come from the shared `names` map: a null name reads "Someone", and the viewer reads "You".
    - `cant_go` → "Sol can't make it this week" ("You can't make it this week");
    - `left` → "Sol left the group";
    - `ended` → "<payload.title> ended", with `title` when the payload has none (G-S6);
    - `next` → "Next one: Thu 20 Nov · Ana's flat", or "Next one: Thu 20 Nov · Place to be decided" when `place_tbd`, the day from `payload.starts_at` in `payload.time_zone`;
    - `joined` with `brought_by` → "Clara joined · brought by Pedro";
    - `cancelled` with `stop` false → "Ana cancelled this Thursday", the weekday from `payload.starts_at` in `payload.time_zone`. With `stop` true → "Ana cancelled the group" (G-S2);
    - `stopped` → "Ana stopped repeating this · the last one is Thu 27 Nov" (G-N13);
    - `made_group` → "Ana made this a group · everyone invited can read this chat" (G-N8).
  - A `system` row whose `state` is `deleted` is never shown (Decision 6). `shownMessages(messages: ChatMessage[]): ChatMessage[]` in `chatModel.ts` drops it, and the screen renders `withEndedLine` over `withPending(shownMessages(messages), queue)`. `systemText` and `rowText` give no line for it.
  - `rowText(last, names, viewerId, group)`: the Chat row's line uses the same group wording (G-S6).
  - `headerLine(summary, now)` on a group: running → `groupHeader(repeatLine(startsAt, timeZone, repeatWeeks), members)`. With `stopped` → `groupStoppedHeader(dayLabel(startsAt, timeZone), members)` (G-S7).
  - Plan 1's `closedCard(summary)` gains the group case, still from `(isGroup, stopped, status)` only (G-N5): a group gives `{ line: groupClosedOn(<closesAt as dayLabel in the plan's zone>), why: closedWhy }`. Plan 1's two one-off cards stay as they are.
  - Plan 1's `withEndedLine` (K-S16) also inserts the computed separator for a stopped group (`isGroup && stopped`) whose `status` is not `cancelled`, at its current occurrence's end. No roll writes `ended` for a group's last occurrence.
  - `EVENT_COPY.groupNotAnswered: "Not answered yet"`.
  - `showsNames(role, response, isGroup)`: true for any role on a group.
  - `MoreRow` gains `"leaveGroup"`. `moreRows(i)` takes `isGroup` and `chatOpen`. A guest of a group, whatever their reply, gets `leaveGroup` last while the chat is open. On an ended or cancelled page it is their only row.
  - `peopleGroups(i)` gains `isGroup` (G-B5):
    - a guest on a group sees, after Going, Maybe and Can't go, a group titled `groupNotAnswered` holding every pending app invitee (`appInvite` rows), each once;
    - a bringer's own pending in-app rows sit in that group too, keeping the circles plan's status ("Invited in the app · brought by you") and `removeInvite` while open (confirmation S4);
    - the bringer's own link rows stay in the circles plan's "Invited, not answered yet" group. Other people's link rows (they carry phone numbers, which the server refuses to guests) and the waiting requests are never shown to a guest;
    - no row appears twice;
    - a pending member is askable on a group, so `connect` is offered while the state is `none`;
    - hosts see what they saw before;
    - a row whose `broughtById` is missing from `bringerNames` shows no "Brought by" line (G-N3).
  - `readEvent` (`mobile/src/services/rsvp.ts:112`) reads the group flag as part of the event (G-N13). After the plan row, `series_is_group({p_series})` runs beside the attendee and organizer reads, or alone for the owner. Its failure throws `eventUnavailable`, as the other parts do. `EventSnapshot.isGroup: boolean`. `counts` stays null on a group, since a pending member reads every guest row there.
  - `useEvent` passes `snapshot.isGroup` to `showsNames`, `moreRows` and `peopleGroups`.
  - `chatGateway.leave(series)` → `leave_series` with `{p_series}`. `chatErrorMessage` maps `'Not in this group'` → `notInGroup`, `"Hosts can't leave"` → `hostsCantLeave`, `"Owner can't leave"` → `ownerCantLeave`.

- [ ] **Step 1: Failing tests:**
  - every new string, exactly;
  - each group `systemText`, with a name, with a null name ("Someone") and as the viewer ("You");
  - `systemText` of `ended` with `payload.title` "Board game night" → "Board game night ended";
  - `cancelled` with `{stop: false, starts_at: "2026-11-20T19:00:00Z", time_zone: "Europe/London"}` → "Ana cancelled this Thursday"; with `stop: true` → "Ana cancelled the group";
  - `stopped` with `starts_at` "2026-11-27T19:00:00Z" in Europe/London → "Ana stopped repeating this · the last one is Thu 27 Nov";
  - `rowText` of a `cant_go` line: `group` true → "Sol can't make it this week", false → "Sol can't make it";
  - `audienceOptions`: on a group, "Everyone in the group · 9" then "Going this Thursday · 6"; on a one-off, "Going · 6" then "Everyone invited · 9";
  - `headerLine`: running → "Every Thursday · 9 in the group"; stopped → "Last one · Thu 27 Nov · 9 in the group";
  - `closedCard` for a stopped group gives "This group's chat closed on Thu 27 Nov." with `closedWhy`, and plan 1's two one-off cases still hold;
  - `withEndedLine` for a stopped group past its end inserts the separator, and for a running group or a cancelled stopped one it does not;
  - `showsNames("guest","pending",true)` true, `showsNames("guest","pending",false)` false;
  - `moreRows`: a group guest gets `leaveGroup`, a one-off guest does not; an ended page with the chat open → `["leaveGroup"]`; the chat closed → no `leaveGroup`;
  - `peopleGroups` as a **guest** whose co-members are all pending, the state right after a roll (owner 01, admin 02, viewer 03, 04, 05, 06 pending): groups "Going · 1" (01) and "Not answered yet · 5", every member's name present, `connect` on 02, 04, 05 and 06 with state `none`, no `linkInvite` or `request` rows, and 6 app and owner rows, equal to the fixture's `members` (G-B5, G-S14);
  - S4: a bringer guest on a group with one brought pending app invitee and one brought link: the invitee appears once, under "Not answered yet", with "Invited in the app · brought by you" and `removeInvite`. The link appears under "Invited, not answered yet". No key appears twice, and the count of rows outside the link group still equals `members`;
  - the same fixture with `isGroup` false: only "Going · 1" (the one-off rule holds);
  - a guest brought by an id missing from `bringerNames`: no "Brought by" line;
  - `announcementLabelGroup("everyone", "Thursday")` → "Announcement to everyone in the group"; `("going", "Thursday")` → "Announcement to people going this Thursday";
  - `shownMessages` of [joined, cant_go with state `deleted`, a message] gives [joined, the message], and `rowText` of the deleted line gives no line;
  - `readEvent` with a stubbed client: `series_is_group` is called with `{p_series}`, and `isGroup` true lands in the snapshot. A failed `series_is_group` rejects with `eventUnavailable`.
- [ ] **Step 2: Run** each with `node --import tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5: Commit:** `"Groups: the app's words for a group"`

### Task 4: Group screens, Leave group, checks and record

**Files:**
- Modify: `mobile/app/chat.tsx`, `mobile/app/event.tsx` (More's Leave this group with the in-place confirm; the people row's names for a group; the Chat row's "Group chat"), `mobile/app/guests.tsx` (a guest's "Not answered yet" group), `mobile/scripts/verify-chat.mjs` (group scenarios), `mobile/scripts/verify-event.mjs`, `qa/chat-release/README.md` (groups part), `knowledge-base/08-decisions.md`, `docs/implementation-status.md`

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - **The chat screen with `summary.isGroup`:**
    - the header from `headerLine`. At accessibility text sizes its second line wraps to as many lines as it needs and never truncates (G-N7);
    - the field line `toGroup`;
    - the announcement sheet from `audienceOptions`, with `announcePlaceholderGroup`;
    - an announcement card on a group is read as `announcementLabelGroup(audience, weekday)`, so the screen reader matches "TO EVERYONE IN THE GROUP" (confirmation NOTE 14);
    - the owner alone: `nobodyGoing` with `groupEmptyHint` in place of `nobodyGoingHint`;
    - the menu's `peopleInGroup(members)` and the red **Leave group** for a member who is not a host, while open;
    - the closed card from `closedCard(summary)`.
  - **The "Next one" line** is a button (`accessibilityRole="button"`, hint "Opens the resbite") that opens `/event?plan=<payload.plan_id>` (G-N7).
  - **A stopped group's last occurrence** shows the computed end separator from `withEndedLine` (Task 3).
  - **Leave group** asks `leaveQuestion(title, weekday)`, with a red "Leave group" and `CHAT_COPY.keep`. On success it returns to My resbites and refreshes. On failure the confirm stays open with the line from `chatErrorMessage`, and Leave group can be tapped again (G-N7).
  - **The event page:** More's "Leave this group" with the same confirm, names on the people row for a group, and the Chat row's first line `groupChat`.

- [ ] **Step 1: Extend `verify-chat.mjs`.** The labels g1 to g9 keep clear of plans 1 and 3.
  - (g1) A group member who said Can't go this week still reads and writes, and sees "Sol can't make it this week".
  - (g2) The "Next one: Thu 20 Nov · Ana's flat" line is a button with the hint "Opens the resbite", and opens the new occurrence.
  - (g3) Leave group calls `leave_series` with `{p_series}` and lands on My resbites.
  - (g4) Leave group answered offline: the confirm stays, the error line shows, and a second tap calls `leave_series` again.
  - (g5) The header reads "Every Thursday · 9 in the group". With `stopped` true it reads "Last one · Thu 27 Nov · 9 in the group".
  - (g6) As host on a group, Announce opens with "Everyone in the group · 9" first and checked, then "Going this Thursday · 6", and the placeholder "Write an update for the group". The sent card is read as "Announcement to everyone in the group".
  - (g7) A stopped group after its close shows "This group's chat closed on Thu 27 Nov." and no field.
  - (g8) After "Cancel just this one": "Ana cancelled this Thursday", no "ended" line, and the field is still there.
  - (g9) With the chat open on "Sol can't make it this week", a signal and `chat_messages_since` return that line with state `deleted`: the line leaves the screen, and "Sol joined" stays (Decision 6).

  `verify-event.mjs`:
  - More shows "Leave this group" on a group, not on a one-off.
  - A **guest** on a group whose co-members are all pending, with no answered row in the fixture, opens the people list. It shows every member's name under "Not answered yet", Connect on each, no phone number, and as many app and owner rows as the chat's `members` (G-B5, G-S14).
  - A bringer guest on a group sees their brought, unanswered person once, under "Not answered yet" with Remove, and their brought link under "Invited, not answered yet" (confirmation S4).
- [ ] **Step 2: Run** with Expo web → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run check`, `verify-chat.mjs`, `verify-event.mjs` → PASS.
- [ ] **Step 5: Runbook** (groups part of `qa/chat-release/README.md`):
  - the migration and rollback hashes;
  - the expected snapshot delta: `stopped_at` on `chats`, the backfilled `is_group` values, `series_leaves`, the new functions and the two triggers;
  - after the apply, a read in the SQL editor of the backfill cases: long-finished stopped groups closed, recently stopped ones open (G-B7);
  - roll back in reverse order only, plan 3's first, and plan 2's rollback loses every leave record (G-N11);
  - device checks:
    - a group carries its chat to next Thursday, and a Can't-go member stays in it;
    - right after the roll, a pending member sees every name;
    - Leave group, online and offline;
    - stopping the series gives the goodbye window and the "stopped repeating" line;
    - the group header at the largest text size.

  Decisions log: this plan's Decisions 1 to 6, the group lines' wording and the Leave confirm.
- [ ] **Step 6: Full check** (three commands) → PASS.
- [ ] **Step 7: Commit:** `"Groups: the screens, leaving, and the record"`
