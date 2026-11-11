# Groups Implementation Plan (chat plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repeating resbite becomes a group: one chat that carries from week to week, everyone in the group in it whatever this week's reply, a goodbye window when the series stops, a way to leave, and the group's people visible to every member.

**Architecture:** One migration adds a sticky group flag and a stop time to `public.chats`, a leave record per series, and redefines the chat's membership and closing rules, the attendee-line trigger, `can_see_guests`, `request_connection` and the roll for groups. It adds `leave_series` and `series_is_group`, and the "ended", "Next one" and "left" lines. The app learns the group wording, the audiences' labels, Leave group, and names for members who have not answered.

**Tech Stack:** as chat plan 1.

**Spec:** `docs/superpowers/specs/2026-11-10-groups-and-chat-design.md` (CH-D1–D3, CH-P1–P4, P6, P15, P19, P21, rules 1 and 1a). CH-P20 (the roll fix) shipped earlier in the follow-ups plan.

**Branch:** `ch2-groups` from `main` after chat plan 1 is merged. Ships in the same release as plans 1 and 3.

## Global Constraints

Chat plan 1's Global Constraints, verbatim, with the migration `supabase/migrations/20261111150000_chat_groups.sql`. Plus: the announcement audiences already mean "Going this Thursday" and "Everyone in the group" once group attendees are members (`private.announcement_audience`, plan 1 Task 2): do not redefine them.

## Review Focus

1. **The host turns "every Thursday" off before the first Thursday.** Expected: the series stays a group (CH-P1); its chat keeps everyone and closes 48 hours after that occurrence's end. Test in Task 1.
2. **"Cancel this and stop repeating" on a first occurrence.** Expected: the group's chat closes 48 hours after the cancellation, not at once. Test in Task 1.
3. **A member who left is invited again (by a host, a circle, or answers an old link).** Expected: the leave is cleared and they are back in the group and its chat. Test in Task 1.
4. **The roll creates next Thursday.** Expected: "Board game night ended" on the old occurrence and "Next one: Thu 20 Nov · Ana's flat" on the new one; no "joined" line for the guests carried along. Test in Task 1.
5. **A member who has not answered this week opens the people list.** Expected: names, avatars and the connection actions show (CH-P21); on a one-off the same person still sees counts only. Tests in Tasks 1 and 2.

---

### Task 1: Migration: the group flag, membership, closing, leaving, visibility and the group lines

**Files:**
- Create: `supabase/migrations/20261111150000_chat_groups.sql`, `supabase/tests/chat-groups.sql` (add to `supabase/tests/hosted-baseline/tests.txt`), `supabase/rollback/20261111150000_chat_groups.rollback.sql`, `supabase/tests/hosted-baseline/20261111150000_chat_groups.before.sql`, `.after.sql`

**Interfaces:**
- Consumes: plan 1's `public.chats`, `private.current_occurrence`, `private.chat_member`, `private.chat_closes_at`, `private.chat_open`, the trigger function behind `attendees_chat_lines`, `private.chat_system_line`; the latest `private.can_see_guests` (`20261031120000_creating_a_resbite.sql:621`), `private.request_connection` (the follow-ups migration), `private.roll_repeating_plans` (the circles migration), `public.chat_summary` (plan 1).
- Produces:
  - `public.chats` gains `is_group boolean not null default false` and `stopped_at timestamptz null`. Backfill: `is_group` true for every series with an occurrence whose `repeat_weeks` is not null or whose `repeats_from` is not null. `stopped_at = now()` for every such series whose current occurrence is cancelled with `repeat_weeks` null.
  - Trigger `plans_group_flag` after insert or update of `repeat_weeks, status` on `public.plans`:
    - `repeat_weeks` not null → `is_group = true` and `stopped_at = null`.
    - On the current occurrence of a group, `repeat_weeks` becoming null, or a cancel that leaves it null, sets `stopped_at = coalesce(stopped_at, now())`.
    - `is_group` never goes back to false (CH-P1).
  - `private.series_leaves (series_id uuid, user_id uuid references public.profiles(id) on delete cascade, left_at timestamptz not null default now(), primary key (series_id, user_id))`, RLS on, no policies.
  - Trigger `attendees_clear_leave` after insert on `public.attendees`: deletes the series' leave for that user, so any way back in clears it (CH-P4).
  - `private.chat_member(p_series, p_user)` redefined: when `is_group`, the hosts of the current occurrence or anyone with an attendee row on it (any response), and not in `series_leaves`; otherwise plan 1's rule.
  - `private.chat_closes_at(p_series)` redefined: for a group, null while `stopped_at` is null (it never closes while running); otherwise `stopped_at + 48 h` when the current occurrence is cancelled, else `plan_end + 48 h`. One-offs keep plan 1's rule.
  - `private.chat_open`: a cancelled group with `stopped_at` set stays open until `closes_at`. A group's "Cancel just this one" stays open (the series runs).
  - The attendee-line trigger function redefined. On a group:
    - an insert by anything but the roll writes `joined {user, brought_by?}`;
    - a change into `declined`/`withdrawn` writes `cant_go {user}`;
    - nothing else writes a line.

    "By the roll" means the same user has a row on the occurrence this one `repeats_from`. One-offs keep plan 1's transitions.
  - Trigger `plans_group_lines` after insert on `public.plans` when `repeats_from` is not null:
    - `ended {}` on the previous occurrence (`plan_id = repeats_from`);
    - `next {plan_id, starts_at, time_zone, place_label, place_tbd}` on the new one.

    Both have no author.
  - `public.leave_series(p_series uuid) returns void`:
    - Must be a member and a group, else `42501 'Not in this group'`.
    - A host of the current occurrence gets `42501 'Hosts can't leave'`.
    - Inserts the leave and deletes the caller's attendee row on the current occurrence. (Deleting `plan_admins` is not needed: hosts are refused.)
    - Writes `left {user}`. No outbox.
  - `private.can_see_guests(p_plan)` redefined: also true when the plan's series `is_group` and the caller has an attendee row on the plan (CH-P21). `can_read_profile` and the avatar policy follow through it.
  - `private.request_connection` redefined (copied from the follow-ups version): on a group, the target may be any attendee (pending included); it replaces the CH-P21 comment at its target check.
  - `private.roll_repeating_plans` redefined (copied from the circles version): the carried-attendee insert skips users in `series_leaves` for the series.
  - `public.series_is_group(p_series uuid) returns boolean`: false unless the caller `can_read_plan` the current occurrence.
  - `public.chat_summary` redefined: adds `is_group`, `stopped`, `repeat_weeks` and `members` (count of `chat_member`).

- [ ] **Step 1: Failing SQL test** (`supabase/tests/chat-groups.sql`, prefix `g2`; owner 01, admin 02, guests 03 Going, 04 Maybe, 05 pending, 06 Can't go; a weekly plan):
```sql
-- is_group true after create_plan_v4 with repeat_weeks 1; after change_plan_v4 with repeat_weeks null: still true, stopped_at set, closes_at = end + 48 h.
-- chat_member true for 01..06 on the group; on a one-off copy of the same people, 05 and 06 false.
-- Cancel with p_stop_repeating on a first occurrence: chat_open true for 47 h after the cancel, false after 48 h (move stopped_at).
-- Cancel just this one: chat_open true; the roll creates the next; 'ended' line on the old plan, 'next' line on the new with its starts_at; no 'joined' line for the carried guests.
-- 03 answers declined on a group: line cant_go; 07 invited in the app: line joined.
-- leave_series as 04: attendee row gone, leave stored, 'left' line, chat_member false; the roll does not carry 04; 01 invites 04 again: the leave is cleared, 04 a member.
-- leave_series as 02 (admin): 42501 'Hosts can't leave'; as a one-off guest: 42501 'Not in this group'.
-- can_see_guests as 05 (pending) on the group: true; on a one-off: false. 05 reads 02's display_name on the group.
-- request_connection from 03 to 05 (pending) on the group: 'requested'; on a one-off: 42501 'Not on this resbite'.
-- Announcement audiences on the group: going = 01 02 03 04; everyone = 01..06 (no change to announcement_audience needed).
-- series_is_group as a stranger: false.
```
- [ ] **Step 2: Run** `bash scripts/test-database-docker.sh` → FAIL.
- [ ] **Step 3: Implement**, with the rollback (restores every redefined body from plan 1 and earlier, drops the triggers, `series_leaves`, the two columns) and the rehearsal files.
- [ ] **Step 4: Run** both modes → PASS. Record the sha256s.
- [ ] **Step 5: Commit** — `"Groups: a repeating resbite's chat carries the group, and members can leave"`

### Task 2: The app's group model and words

**Files:**
- Modify: `mobile/src/domain/chatCopy.ts` and test, `mobile/src/domain/chatRules.ts` and test, `mobile/src/services/chat.ts` (summary fields, `leave(series)`) and test, `mobile/src/domain/eventPage.ts` and test (`showsNames`, `moreRows`, `peopleGroups`), `mobile/src/state/useEvent.ts` (reads `series_is_group`)

**Interfaces:**
- Produces:
  - `CHAT_COPY` adds:
    - `toGroup: "To: everyone in the group, now and later"`, `groupChat: "Group chat"`;
    - `audienceGroup: (n) => \`Everyone in the group · ${n}\``, `audienceGoingDay: (day, n) => \`Going this ${day} · ${n}\``, `announcementToGroup: (a, day) => a === "everyone" ? "ANNOUNCEMENT · TO EVERYONE IN THE GROUP" : \`ANNOUNCEMENT · TO GOING THIS ${day.toUpperCase()}\``;
    - `peopleInGroup: (n) => \`People in this group · ${n}\``, `groupHeader: (repeat, n) => \`${repeat} · ${n} in the group\``;
    - `leaveGroup: "Leave group"`, `leaveThisGroup: "Leave this group"`, `leaveQuestion: (title, day) => \`Leave ${title}? You'll stop getting its ${day}s and its chat.\``;
    - `groupClosedOn: (day) => \`This group's chat closed on ${day}.\``, `notInGroup: "You're not in this group."`, `hostsCantLeave: "Hosts can't leave. Step down first."`.
  - `systemText(m, names, group)` with `group = true`:
    - `cant_go` → "Sol can't make it this week";
    - `left` → "Sol left the group";
    - `ended` → "<title> ended";
    - `next` → "Next one: Thu 20 Nov · Ana's flat", with "Place to be decided" when `place_tbd`;
    - `joined` with `brought_by` → "Clara joined · brought by Pedro".
  - `showsNames(role, response, isGroup)`: true for any role on a group.
  - `MoreRow` gains `"leaveGroup"`, offered to a guest of a group (any response) while the chat is open.
  - `peopleGroups(i)` gains `isGroup` and offers `connect` to a group's pending attendees.
  - `chatGateway.leave(series)` → `leave_series`; `chatErrorMessage` maps `'Not in this group'` → `notInGroup`, `"Hosts can't leave"` → `hostsCantLeave`.

- [ ] **Step 1: Failing tests:**
  - every new string;
  - each group `systemText`;
  - `showsNames("guest","pending",true)` is true, while `showsNames("guest","pending",false)` is false;
  - `moreRows` for a group guest includes `leaveGroup`, and for a one-off does not;
  - `peopleGroups` with `isGroup` offers `connect` on a pending member.
- [ ] **Step 2: Run** each with `node --import tsx` → FAIL. **Step 3: Implement.** **Step 4:** `npm run check` → PASS.
- [ ] **Step 5: Commit** — `"Groups: the app's words for a group"`

### Task 3: Group screens, Leave group, checks and record

**Files:**
- Modify: `mobile/app/chat.tsx`, `mobile/app/event.tsx` (More's Leave this group with the in-place confirm; the people row's names for a group; the Chat row's "Group chat"), `mobile/app/guests.tsx` (no change expected beyond the inputs), `mobile/scripts/verify-chat.mjs` (group scenarios), `mobile/scripts/verify-event.mjs`, `qa/chat-release/README.md` (groups part), `knowledge-base/08-decisions.md`, `docs/implementation-status.md`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - **The chat screen with `summary.is_group`:**
    - the header `groupHeader("Every Thursday", members)`;
    - the field line `toGroup`;
    - the audiences `audienceGroup` and `audienceGoingDay`;
    - the menu's "People in this group" and the red **Leave group** for a non-host;
    - the closed card `groupClosedOn`.
  - **Leave group** asks `leaveQuestion(title, "Thursday")`, with a red "Leave group" and "Keep". On success it returns to My resbites and refreshes.

- [ ] **Step 1: Extend `verify-chat.mjs`:**
  - (j) a group member who said Can't go this week still reads and writes, and sees "Sol can't make it this week";
  - (k) the "Next one: Thu 20 Nov · Ana's flat" chip opens the new occurrence;
  - (l) Leave group calls `leave_series` with `{p_series}` and lands on My resbites;
  - (m) a pending group member's people list shows names and Connect.

  `verify-event.mjs`: More shows "Leave this group" on a group, not on a one-off.
- [ ] **Step 2: Run** with Expo web → FAIL. **Step 3: Implement.** **Step 4:** `npm run check`, `verify-chat.mjs`, `verify-event.mjs` → PASS.
- [ ] **Step 5: Runbook** (groups part of `qa/chat-release/README.md`):
  - the migration hash;
  - the expected snapshot delta;
  - device checks: a group carries its chat to next Thursday, a Can't-go member stays in it, Leave group, stopping the series gives the goodbye window.

  Decisions log: the group lines' wording and the Leave confirm.
- [ ] **Step 6: Full check** (three commands) → PASS. **Commit** — `"Groups: the screens, leaving, and the record"`
