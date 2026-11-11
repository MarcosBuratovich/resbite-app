# Report and Block Implementation Plan (chat plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can report a message or a person and block a person, a block hides that person's messages and pushes and ends any connection, the Resbite team has a queue to read, and the app shows a contact address, so the chat meets App Store guideline 1.2.

**Architecture:** One migration adds blocks and reports, the functions to block, unblock and report, and the block rule in the chat reads, the push eligibility and the connection functions. Two owner-run scripts read and close reports. The app gets a report sheet and a block confirm, reachable from a message, a person's sheet and the chat menu. The support address comes from the EAS environment. This plan also completes the release runbook for all three chat plans.

**Tech Stack:** as chat plan 1.

**Spec:** `docs/superpowers/specs/2026-11-10-groups-and-chat-design.md` CH-P13, CH-P18 and the Anti-goals; `docs/superpowers/specs/2026-11-10-connections-and-circles-design.md` CO-P14 (a block ends a connection and refuses new ones).

**Branch:** `ch3-safety` from `main` after chat plan 2 is merged. Ships in the same release as plans 1 and 2.

## Global Constraints

Chat plan 1's Global Constraints, verbatim, with the migration `supabase/migrations/20261111160000_chat_safety.sql`. Plus:
- **The blocked person is never told** (CH-P13). No message, state, error or count differs for them, as the refused requester's view does not differ in plan 1 of connections.
- **Reports freeze the reported text** at the time of the report. Nothing else of the chat goes into a report.
- **No support address is invented.** It comes from `EXPO_PUBLIC_SUPPORT_ADDRESS` (set by the owner in the EAS production environment). While it is unset the app shows no contact line, and the release runbook blocks submission.

## Decisions this plan makes

1. **Unblocking exists**, from the same person's sheet ("Unblock Leo"), because a block made by mistake must be undoable; the spec's `block_user(p_user, p_block)` already allows it.
2. **A blocker who asks the blocked person to connect** gets `22023 'Unblock first'`: only the blocker learns anything. **The blocked person asking the blocker** gets the quiet `'requested'` of a refusal, with nothing stored or sent.
3. **The chat menu's "Report or block"** opens a sheet listing the chat's people (the spec's recommended option, CH-04); each row opens that person's report and block sheet.
4. **Reasons:** Harassment · Spam · Not appropriate · Something else, plus an optional line of up to 500 characters (CH-P13).

## Review Focus

1. **The blocked person keeps writing.** Expected: the blocker never sees the new messages, the line for them, their Chat-row preview or a push; everyone else sees them. Test in Task 1.
2. **Blocking a host.** Expected: the host's messages and announcements disappear for the blocker, while the resbite's own changes (time, place, cancel) still reach them as system lines and pushes. Test in Task 1.
3. **Reporting a message that is later deleted.** Expected: the report keeps the frozen text; the message shows "Message deleted" to everyone. Test in Task 1.
4. **Two blocks between the same people (A blocks B, B blocks A).** Expected: each hides the other's messages; either unblocking leaves the other block standing. Test in Task 1.
5. **The support address unset in a build.** Expected: Data & privacy shows no contact line and no empty placeholder; the runbook check catches it before submission. Test in Task 3.

---

### Task 1: Migration: blocks, reports and the block rule everywhere

**Files:**
- Create: `supabase/migrations/20261111160000_chat_safety.sql`, `supabase/tests/chat-safety.sql` (add to `tests.txt`), rollback and rehearsal files
- Create: `supabase/ops/open-reports.sql`, `supabase/ops/close-report.sql`

**Interfaces:**
- Consumes: the chat tables and functions of plans 1 and 2; the latest `private.request_connection` (plan 2), `private.my_connections` and `private.plan_connection_states` (the connections migration), `private.notification_recipient_eligible` and the deletion function (plan 1).
- Produces:
  - `private.blocks (blocker_id uuid references public.profiles(id) on delete cascade, blocked_id uuid references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id))`, index on `blocked_id`.
  - `private.reports`, with these columns:
    - `id bigint generated always as identity primary key`;
    - `reporter_id uuid null references public.profiles(id) on delete set null`, `target_user_id uuid null`, `message_id bigint null references public.messages(id) on delete set null`, `series_id uuid null`, `plan_id uuid null`;
    - `reason text not null check (reason in ('harassment','spam','inappropriate','other'))`, `details text null check (details is null or char_length(details) <= 500)`;
    - `frozen_body text null`, `frozen_author uuid null`;
    - `created_at timestamptz not null default now()`;
    - `status text not null default 'open' check (status in ('open','reviewed','actioned'))`, `reviewed_at timestamptz null`, `review_note text null`.
  - `public.block_user(p_user uuid, p_block boolean) returns void`:
    - Not oneself (`22023 'That is you'`).
    - Blocking inserts the block and deletes any `public.connections` row of the pair.
    - Unblocking deletes the block.
    - Both are silent.
  - `public.my_blocks() returns jsonb`: an array of the user ids the caller blocked.
  - `public.report_message(p_id bigint, p_reason text, p_details text default null) returns void`: the caller must be able to read the message now (`chat_member` of its series), else `22023 'Report unavailable'`. Freezes `body` and `author_id`; `target_user_id` is the author.
  - `public.report_user(p_user uuid, p_series uuid, p_reason text, p_details text default null) returns void`: the caller and `p_user` share the series (both `chat_member`, or both on its current occurrence's people list), else `22023 'Report unavailable'`.
  - `chat_messages`, `chat_messages_since` and `my_chat_overview` (its `last`) skip `kind in ('message','announcement')` rows whose author the caller blocked. System lines are never skipped.
  - `notification_recipient_eligible`: a `chat_message` or `announcement` whose author the recipient blocked is not eligible.
  - `request_connection`:
    - a block by the caller of `p_user` → `22023 'Unblock first'`;
    - a block by `p_user` of the caller → return `'requested'` with nothing stored or sent;
    - accept paths unchanged (no pair row survives a block).
  - `my_connections` omits people the caller blocked. `plan_connection_states` reads `none` for them.
  - Deletion: the person's blocks both ways are deleted; reports keep their rows (`reporter_id` set null by the foreign key when the profile goes; the lifecycle keeps the profile, so set it null explicitly).
  - `supabase/ops/open-reports.sql` (owner-run, read-only): the open reports, oldest first, with reason, details, frozen text, the reporter's and target's display names, the resbite title and the date. No phone numbers or emails.
  - `supabase/ops/close-report.sql` (owner-run): sets `status`, `reviewed_at = now()` and `review_note` for one id, given as a psql variable (`\set report_id …`, `\set status 'reviewed'`), in one transaction that prints the updated row.

- [ ] **Step 1: Failing SQL test** (`supabase/tests/chat-safety.sql`, prefix `s3`), pinning the Review Focus:
```sql
-- 03 blocks 04: 03's chat_messages skips 04's messages and announcements but keeps system lines; 05 still sees them.
-- 04's new message queues a chat_message for 03 that is not eligible; 05's is.
-- my_chat_overview for 03 never shows 04's text as last.
-- 03 blocks host 02: 02's announcement is hidden and not eligible for 03; a place change by 02 still writes a line and a plan_changed notice to 03.
-- The 03-04 connection row is deleted by the block; 03 asks 04 → 22023 'Unblock first'; 04 asks 03 → 'requested', no row, no outbox.
-- my_connections for 03 omits 04; unblock: 04's messages reappear, no connection comes back.
-- Mutual blocks: 03 unblocks 04 while 04 blocks 03 → 04 still does not see 03's messages.
-- report_message by 05 on 04's message → row with frozen_body, frozen_author 04; 04 deletes it → report unchanged; 08 (stranger) → 22023 'Report unavailable'.
-- report_user by 05 about 04 on the series → row; reasons outside the four → check_violation; details of 501 chars → check_violation.
-- Deletion (guarded): 03's blocks are gone; 05's reports keep their rows with reporter_id null after 05's deletion.
-- open-reports.sql runs as postgres and returns the open rows with no phone or email column.
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (with the rollback and rehearsal). **Step 4: Run** both modes → PASS. Record the sha256s.
- [ ] **Step 5: Commit** — `"Safety: blocks and reports, and the block rule in every read"`

### Task 2: Report and block in the app

**Files:**
- Create: `mobile/src/domain/safetyCopy.ts` and test, `mobile/src/services/safety.ts` and test, `mobile/src/design/ReportSheet.tsx`
- Modify: `mobile/app/chat.tsx` (long-press "Report message"; a tap on an author's name opens their sheet; the menu's "Report or block" opens the people sheet), `mobile/app/guests.tsx` and `mobile/src/domain/eventPage.ts` (`PersonAction` gains `report`, `block` and `unblock` on every row with a `userId` other than the viewer's; `Row.text` entries; `ACTION_ICON`; a `"report"` sheet view), `mobile/src/state/useEvent.ts` (reads `my_blocks` beside the connection states), `mobile/scripts/verify-chat.mjs`, `mobile/scripts/verify-event.mjs`, `mobile/package.json`

**Interfaces:**
- Produces:
  - `SAFETY_COPY` (exact):
    - the report sheet: `report: "Report"`, `reportMessage: "Report message"`, `reportPerson: (name) => \`Report ${name}\``, `reportOrBlock: "Report or block"`, `why: "What's wrong?"`, `reasons: { harassment: "Harassment", spam: "Spam", inappropriate: "Not appropriate", other: "Something else" }`, `detailsLabel: "Anything else? (optional)"`, `sendReport: "Send report"`, `thanks: "Thanks. The Resbite team will look at it."`;
    - block and unblock: `block: (name) => \`Block ${name}\``, `blockQuestion: (name) => \`Block ${name}? You won't see their messages, and they won't know.\``, `unblock: (name) => \`Unblock ${name}\``, `blocked: "Blocked"`;
    - errors: `unavailable: "You can't report that any more."`, `unblockFirst: "Unblock this person first."`.
  - `createSafetyGateway(rpc, deadline?)` → `{ block(userId), unblock(userId), myBlocks(), reportMessage(id, reason, details?), reportUser(userId, series, reason, details?) }` and `safetyErrorMessage(e)`.
  - `ReportSheet({ target, onDone })`: the four reasons as a radio group, the optional field, Send report; the thanks line in place; the reporter keeps using the chat.
  - The person's sheet (people list and chat):
    - "Report <name>", "Block <name>" (red, in-place confirm with `blockQuestion`) or "Unblock <name>";
    - the connection actions hide while blocked;
    - a "Blocked" badge on the row for the blocker only.

- [ ] **Step 1: Failing tests:**
  - every string;
  - each gateway call and argument;
  - `safetyErrorMessage` maps `'Report unavailable'` → `unavailable` and `'Unblock first'` → `unblockFirst`;
  - `peopleGroups` gives every other row `report` and `block`, and `unblock` instead of `block` when the person is in `blocks`.

  `verify-chat.mjs`:
  - (n) long-press → Report message → Spam → Send → `report_message` with `{p_id, p_reason:"spam", p_details:null}`, then the thanks line;
  - (o) the menu → Report or block → Leo → Block Leo → confirm → `block_user` with `{p_user, p_block:true}`, and the next fetch's list without Leo's messages.

  `verify-event.mjs`: the people sheet shows Report and Block.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm run check`, `verify-chat.mjs`, `verify-event.mjs` → PASS.
- [ ] **Step 5: Commit** — `"Safety: report and block from a message, a person and the chat"`

### Task 3: The contact address, the App Store notes and the release runbook

**Files:**
- Modify: `mobile/app/data-privacy.tsx` (a "Contact" topic shown only when `process.env.EXPO_PUBLIC_SUPPORT_ADDRESS` is a non-empty string: "Questions, or something wrong in a chat? Write to <address>." The address is selectable text, with a copy button using `expo-clipboard` only if it is already a dependency, else selectable text alone), `mobile/src/domain/safetyCopy.ts` (`contact: (address) => \`Questions, or something wrong in a chat? Write to ${address}.\``) and its test
- Create: `qa/chat-release/app-store-review-notes.md`
- Modify: `qa/chat-release/README.md` (complete it), `knowledge-base/08-decisions.md`, `docs/implementation-status.md`

**Interfaces:**
- Produces:
  - `supportAddress(env: string | undefined): string | null` in `safetyCopy.ts` (trimmed, null when empty) with tests.
  - The App Store review notes, which say:
    - how to reach a chat with the review account;
    - where Report and Block are;
    - that reports reach the Resbite team through the queue;
    - the contact address.
  - The completed release runbook, in this order, each step with its owner approval:
    1. Before snapshot. Approve the three migrations (`20261111140000_chat_core`, `20261111150000_chat_groups`, `20261111160000_chat_safety`) by name and sha256, and apply them in order with the history repair after each. After snapshot and advisors (expected: `rls_enabled_no_policy` INFO on the new public tables, nothing above INFO).
    2. **Realtime "Allow public access" off** (owner, dashboard).
    3. The sender redeploy.
    4. **`EXPO_PUBLIC_SUPPORT_ADDRESS` set in the EAS production environment, checked with `npx eas env:list --environment production`; submission is blocked until it is set.**
    5. The TestFlight build and submit, with the review notes pasted into App Store Connect.
    6. Device checks for core, groups and safety.
    7. Reading the reports queue: who and how often, per the owner's decision.

- [ ] **Step 1: Failing tests:** `supportAddress(undefined)`, `supportAddress("  ")` give null; `supportAddress(" help@x.example ")` gives `"help@x.example"`; the contact string. `verify-*.mjs` covering Data & privacy (find it with `grep -l "Privacy" mobile/scripts`) checks there is no contact line when the variable is unset.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm run check` and that script → PASS.
- [ ] **Step 5: Full check:** `bash scripts/test-database-docker.sh`, `(cd mobile && npm run check)`, the edge tests → PASS ×3.
- [ ] **Step 6: Commit** — `"Safety: the contact address, the review notes and the release runbook"`
