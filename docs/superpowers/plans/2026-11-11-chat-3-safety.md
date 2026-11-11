# Report and Block Implementation Plan (chat plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can report a message or a person and block a person. A block hides that person's messages and pushes everywhere and ends any connection, and the blocked person can't tell. A first message waits for the chat rules, and a blocked-terms list stops the worst words. Each report pushes the Resbite team, who have scripts to read, close, remove and suspend. The app shows a contact address. Together these meet App Store guideline 1.2.

**Architecture:** One migration in two sections. Section 1 adds blocks and the block rule in the chat reads, the push eligibility, the connection functions and `invite_contacts`. Section 2 adds reports, moderators and the `report_filed` notice, the chat-rules acceptance, the blocked-terms filter and the deletion step. Six owner-run scripts for the SQL editor read and close reports, remove a reported message, suspend an account, and set the moderators and the blocked terms. The sender words the moderators' push. The app gets a report sheet, a block confirm, the chat-rules sheet and a "Blocked people" screen, reachable from a message, a person's sheet, the chat menu and Data & privacy. The support address comes from the EAS environment. This plan also completes the release runbook for all three chat plans.

**Tech Stack:** as chat plan 1.

**Spec:** `docs/superpowers/specs/2026-11-10-groups-and-chat-design.md` CH-P13, CH-P18 and the Anti-goals; `docs/superpowers/specs/2026-11-10-connections-and-circles-design.md` CO-P3 (a refusal is invisible) and CO-P14 (a block ends a connection and refuses new ones).

**Branch:** `ch3-safety` from `main` after chat plan 2 is merged. Ships in the same release as plans 1 and 2.

**Tasks:** 7.

## Revised 11 November 2026

This plan absorbs the rulings in `.superpowers/sdd/challenges/chat-rulings.md` on the findings in `.superpowers/sdd/challenges/groups-and-safety.md`. Plans 1, 2 and 3 share the rulings' "Shared interfaces" table, used here verbatim.

Rulings absorbed, one line each:
- **Shared interfaces:** the three-argument `chat_messages_since`, reads that answer `{rows, names, as_of}`, `payload.actor`, the deletion flag kept in the deletion body, and `ChatSummary` in camelCase. Tasks 1, 2 and 4.
- **G-B1:** a block reads to the blocked person exactly as the refusal machinery does. Task 1.
- **G-B2:** both block checks run before every accept path in `request_connection`. Task 1.
- **G-B3:** `chat_summary`, copied from plan 2, hides a blocked author's pinned card, and unread and counts cover only what the caller may see. Task 1.
- **G-B4(a):** the blocked-terms table, `22023 'Not allowed'`, "That message can't be sent.", the owner's script and the release gate. Tasks 2, 4, 5 and 7.
- **G-B4(b):** `remove-reported-message.sql` and `suspend-account.sql`, and `close-report.sql` records which was used. Tasks 2 and 7.
- **G-B4(c):** `private.moderators`, the `report_filed` push and a daily check. Tasks 2, 3 and 7.
- **G-B4(d):** the one-time chat-rules sheet, `chat_rules_acceptances`, `accept_chat_rules` and `22023 'Rules not accepted'`. Tasks 2, 4 and 5.
- **G-B4(e):** `report_message` accepts anyone in an announcement's audience. Task 2.
- **G-S8:** after a block or unblock the chat reloads and replaces its list. Tasks 4 and 5.
- **G-S9:** Block only on request rows, and `report_user` and `report_message` as the finding defines them. Tasks 2 and 4.
- **G-S10:** "Blocked people" under Data & privacy, with `my_blocks` returning `{user_id, name}`. Tasks 1 and 6.
- **G-S11:** deleting an account deletes the reports it filed, and Data & privacy says what a report keeps. Tasks 2 and 6.
- **G-S12:** the ops scripts are plain SQL with one literal at the top, run in the SQL editor. Tasks 2 and 7.
- **G-S13:** the owner's default is built: a blocked person's invitation never reaches the blocker in the app. Task 1.
- **G-S14 (plan 3 items):** the request test, the check after a block, the exact columns of `open-reports.sql`, and the address in a build. Tasks 1, 2, 5 and 6.
- **G-N6 (plan 3 items):** the `ReportSheet` target, the error fallback, the 500-character field, and the chat's people read through `useEvent`. Tasks 4 and 5.
- **G-N7 (plan 3 items):** the report sheet's accessibility and states, focus after a block, and no "Report or block" when alone. Task 5.
- **G-N9:** the block confirm for a host. Tasks 4 and 5.
- **G-N10:** selectable address, Copy, a `mailto:` link, and the address under the report's thanks. Tasks 4 and 6.
- **G-N11:** roll back in reverse order only, in the rollback header and the runbook. Tasks 2 and 7.
- **G-N12:** report targets, one report per message, and a block on an unreadable id. Tasks 1, 2 and 5.

Departures and choices, recorded:
- G-S11 now follows the spec. Deleting an account deletes the reports it filed (CH-P18). The earlier text kept them with `reporter_id` null. Decision 7.
- G-B4(d) adds chat rules the spec does not have. The Terms document and `TERMS_VERSION` stay the owner's. Decision 8.
- G-B4(a) adds a blocked-terms filter, and G-B4(c) a moderator push. The spec has neither. Decisions 9 and 10.
- G-S13's owner default: a blocked person's invitation reaches the blocker only as a personal link the inviter sends outside Resbite. Decision 11.
- G-B2's order: the block checks follow the two visibility refusals, not the "That is you" check directly. Placed first, a blocked person asking where they may not ask would get `'requested'` where anyone else gets 42501. They would also store a refusal that lets them read the blocker's profile. The checks still come before every accept path. CH-R-A1 accepts this order.
- G-B4(b) with CH-R-A3: a message the team removes keeps `state = 'removed'` and gets `payload = {"by": "resbite"}`, and the app words it "Message removed by Resbite". A host's removal keeps "Message removed by an admin".
- `suspend-account.sql` also revokes the account's live grant, since a phone account has no roster row.
- G-S9: `report_message` also admits someone who left the group after the message was written. The finding's "a row on the message's `plan_id`" misses the occurrence they left, whose row `leave_series` deletes.
- G-N12: "an id the caller may not read" counts a chat author, an announcement author whose audience holds the caller, and a waiting join requester as readable, since the app shows each by name.
- On a one-off, `report_message`'s "row on the message's `plan_id`" counts only a host or a Going or Maybe reply, so a pending or Can't-go invitee who never read the message can't probe ids with it. A group keeps any row (CH-R-A5, confirmation NOTE 15).

### Revision 2 (11 November 2026)

From `.superpowers/sdd/challenges/chat-confirmation.md`, adopted by CH-R-A5:
- **CH-R-A1:** the block checks' order is accepted as written. Task 1.
- **B2:** the `my_connections` redefinition is gone, with its rollback and rehearsal entries. "my_connections for 03 omits 04" stays as a plain assertion. Tasks 1 and 2.
- **B3 (CH-R-A3):** `remove-reported-message.sql` sets `payload = {"by": "resbite"}`, and the app words the row "Message removed by Resbite". The opposite choice recorded earlier is replaced. Tasks 2, 4 and 5.
- **S2:** `send_message`'s fan-out leaves out everyone who blocked the author, so a blocked person can't use up the blocker's one push a minute. Task 1.
- **S5:** `report_user` also admits an author the caller may read in the series' chat, such as a removed one-off guest. Task 2.
- **S6:** plan 1's `supabase/tests/local/chat-send-concurrency.sh` gets the guarded rules acceptance. Task 2.
- **S7:** Report and Block from the invitation card's announcement line, using the overview entry's `id` that plan 1 adds. `block_user` reads an announcement author whose audience holds the caller. Tasks 1 and 5.
- **NOTE 6:** the per-caller counts are `state='sent'` messages and announcements the caller may see (K-N12). Task 1.
- **NOTE 7:** `report` joins `showsInForeground`. Task 3.
- **NOTE 8:** one open report per reporter, person and series. A repeat answers the same thanks and pushes nobody. Task 2.
- **NOTE 12:** test ids use the hex prefix `e7`. Emails keep `s3-`. Task 1.
- **NOTE 13:** the G-B1 "asking" test asks from a plan of another series. Task 1.
- **NOTE 15:** on a one-off, the "row on the message's plan" test needs a host or a Going or Maybe reply. Task 2.

### Revision 3 (11 November 2026)

From `.superpowers/sdd/challenges/chat-confirmation-2.md`, adopted by CH-R-A7:
- **SHOULD 3:** `chat-safety.sql` accepts the chat rules for every sender in slice 1's setup, guarded by `to_regclass`, and for slice 2's later senders after its rules assertions. Tasks 1 and 2.
- **SHOULD 4:** the per-caller `last` leaves out a `system` row whose state is `deleted` (plan 2's Decision 6) and falls back to the previous visible row. Task 1.
- **NOTE 1:** the S7 test moves the first announcement back 61 seconds before the second, so plan 1's `'Too fast'` doesn't answer it. Task 1.
- **NOTE 6 (plan 3's part):** the terms check matches the body as plan 1 trimmed it, not `btrim(p_body)`. Task 2.
- **CH-R-A8 (confirmation 3):** each guarded rules acceptance is a `do` block with `execute`; slice 2 adds 02 to the accepting senders; slice 1 puts 02's blocked-host announcement on the group's series so S7's first announcement on the one-off is not 'Too fast'.

## Global Constraints

Chat plan 1's Global Constraints, verbatim, with the migration `supabase/migrations/20261111160000_chat_safety.sql`. Plus:
- **The blocked person is never told** (CH-P13). No message, state, error or count differs for them. A block reads to them exactly as a refusal or a removal of connections does (G-B1).
- **Reports freeze the reported text** at the time of the report. Nothing else of the chat goes into a report.
- **No support address is invented.** It comes from `EXPO_PUBLIC_SUPPORT_ADDRESS`, set by the owner in the EAS production environment. While it is unset the app shows no contact line, and the release runbook blocks submission.
- **Shared interfaces** are the rulings' table (`.superpowers/sdd/challenges/chat-rulings.md`), verbatim. Where plan 1's or plan 2's text differs, the table wins.
- **Owner choices are built with the rulings' defaults** (roadmap, owner-decisions table): no blocked terms seeded, the owner as the one moderator, the rulings' chat-rules wording with the Terms document unchanged, and G-S13's default for invitations.
- **Ops scripts are plain SQL for the dashboard SQL editor** (G-S12). Each has one literal, or one list, at the top to edit, and no psql meta-commands. Each runs in one transaction and prints counts or rows, never a phone number or an email of a reported person.
- A new table revokes all from `public, anon, authenticated, service_role`. A new function revokes execute from the same four before its explicit grants (K-S5).

## Decisions this plan makes

1. **Unblocking exists,** from the person's sheet ("Unblock Leo") and from Profile → Data & privacy → Blocked people (G-S10). A block made by mistake must be undoable, wherever the two last met.
2. **A block reads as a refusal** (G-B1, G-B2). The blocker asking the blocked person gets `22023 'Unblock first'`, so only the blocker learns anything. The blocked person asking the blocker leaves a visible refusal, as "Not now" does, and nothing is sent. Both checks run before every accept path.
3. **The chat menu's "Report or block"** opens a sheet listing the chat's people (CH-04's recommended option). Each row opens that person's report and block sheet. The entry is hidden when nobody else is in the chat (G-N7).
4. **Reasons:** Harassment · Spam · Not appropriate · Something else, plus an optional line of up to 500 characters (CH-P13).
5. **A join requester can be blocked, not reported** (G-S9). They are not on the resbite, so `report_user` would refuse them.
6. **One report per person per message** (G-N12). A repeat answers the same thanks and stores nothing.
7. **Deleting an account deletes the reports it filed** (CH-P18, G-S11). Reports about the person stay, with the frozen text.
8. **The chat rules come before a first message** (G-B4(d)). A one-time sheet, stored per person and version `2026-11`. The Terms document and `TERMS_VERSION` are the owner's, outside this plan.
9. **A blocked-terms list stops a message before it is stored** (G-B4(a)). The migration seeds nothing, and the owner fills the list before the release.
10. **Each new report pushes the moderators** (G-B4(c)) with "A new report is waiting.". The push carries no content, and its tap opens nothing.
11. **A blocked person can't reach the blocker by invitation in the app** (G-S13, owner default). Their `invited` notice is not eligible, and the blocker's number reads to them as an unknown one.
12. **A host who blocks is told what they give up** (G-N9). There is no collapsed row for a blocked person's messages.
13. **Reporting and blocking work on a closed chat,** as Delete and Remove do (K-S17's default). Reporting is not writing.

## Review Focus

1. **The blocked person keeps writing.** Expected: the blocker never sees their new messages, the pinned card, the Chat-row preview, an unread dot or a push from them. Everyone else sees all of it. Test in Task 1.
2. **The blocked person asks to connect, had asked, or was connected.** Expected: they see "Request sent", or no request after a connection ends, exactly as after a refusal or a removal. No accept path connects them (G-B1, G-B2). Test in Task 1.
3. **Blocking a host.** Expected: the host's messages and announcements disappear for the blocker, the pinned card and the invitation-card line included. The resbite's own changes still arrive. The host's counts don't move (G-B3). Test in Task 1.
4. **A report reaches someone.** Expected: the frozen text stays even if the message is deleted. Each moderator gets one push with no content. The team removes the message and suspends the account from the SQL editor (G-B4(b), (c)). Tests in Tasks 2 and 3.
5. **A first message from someone who never agreed to the chat rules.** Expected: the sheet comes first, and the server refuses without an acceptance. A blocked term is refused with "That message can't be sent." Tests in Tasks 2 and 5.
6. **Two blocks between the same people (A blocks B, B blocks A).** Expected: each hides the other's messages, and either unblocking leaves the other block standing. Test in Task 1.
7. **The support address unset, then set, in a build.** Expected: unset, Data & privacy shows no contact line and no empty placeholder, and the runbook blocks submission. Set, the address shows as selectable text with Copy and a mail link. Test in Task 6.

---

### Task 1: Migration section 1: blocks and the block rule everywhere

**Files:**
- Create: `supabase/migrations/20261111160000_chat_safety.sql` (section 1), `supabase/tests/chat-safety.sql` (slice 1; add it to `supabase/tests/hosted-baseline/tests.txt`), `supabase/tests/hosted-baseline/20261111160000_chat_safety.after.sql` (first assertions)

**Interfaces:**
- Consumes: plan 1's chat tables and functions (`chat_messages`, `chat_messages_since(p_series, p_after, p_changed_after)`, `my_chat_overview`, `notification_recipient_eligible`, `private.chat_member`, `private.announcement_audience`); plan 1's `send_message`; plan 2's `chat_summary` and `request_connection` bodies; `private.plan_connection_states` (latest, `20261110120000_connections.sql`); `private.invite_contacts` (latest, the circles migration `20261111130000_circles_of_trust.sql`); `private.can_read_profile`; the connection functions' pair lock, `hashtextextended(a||':'||b, 53)`.
- Produces:
  - `private.blocks (blocker_id uuid references public.profiles(id) on delete cascade, blocked_id uuid references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id))`, index on `blocked_id`. RLS on, no policies, all revoked from the four roles.
  - `public.block_user(p_user uuid, p_block boolean) returns void`, with `private.block_user`:
    - `22023 'That is you'` for oneself;
    - takes the pair's advisory lock first, as the connection functions do;
    - an id the caller may not read gets the same success and stores nothing (G-N12). The caller may read `p_user` when one of these holds:
      - `private.can_read_profile(p_user)`;
      - `p_user` wrote a `message` or `announcement` in a chat the caller is a member of now;
      - `p_user` wrote an announcement whose audience includes the caller now (`private.announcement_audience`), as a pending invitee meets it on the invitation card (confirmation S7);
      - `p_user` has a waiting join request on a resbite the caller hosts;
    - blocking inserts the block (`on conflict do nothing`), then leaves the pair as the refusal machinery would (G-B1):
      - connected: the row goes, and a hidden refusal stays as `remove_connection` leaves it (`from_user` the blocked person, `to_user` the blocker, the row's series, `hidden = true`);
      - a request by the blocked person: the row goes, and a visible refusal stays on the request's series as `decline_connection` leaves it (`hidden = false`);
      - a request by the blocker: the row goes as `cancel_connection_request` takes it, its hiding of the blocker's refusals included;
    - unblocking deletes the block only. Refusals stay, as after a "Not now";
    - silent either way. Execute granted to `authenticated` only.
  - `public.my_blocks() returns jsonb`, with `private.my_blocks`: `[{user_id, name}]` for the people the caller blocked, newest first. `name` is the first word of `display_name`, or null for a deleted, deleting or folded profile, as in the shared `names` map (G-S10). Granted to `authenticated` only.
  - Chat reads redefined, each copied from plan 1's latest body: `chat_messages(p_series, p_before, p_limit)`, `chat_messages_since(p_series, p_after, p_changed_after)` and `my_chat_overview()` skip `kind in ('message','announcement')` rows whose author the caller blocked. System lines are never skipped. The `names` map covers the rows returned.
  - `my_chat_overview()` also (G-B3):
    - `last` is the newest row the caller may see, leaving out a `system` row whose state is `deleted` (plan 2's Decision 6), so it falls back to the previous visible row (confirmation 2, SHOULD 4);
    - `unread` is plan 1's test, applied only to rows the caller may see;
    - `count` counts the `state='sent'` messages and announcements the caller may see (K-N12, confirmation NOTE 6);
    - `announcements` holds the latest `everyone` announcement whose author the caller has not blocked.
  - `public.chat_summary` redefined, copied from **plan 2's** body (G-B3):
    - `pinned` is null when the caller blocked its author;
    - `last` is the newest row the caller may see, leaving out a `system` row whose state is `deleted`, as in `my_chat_overview`. `names` covers only what is returned;
    - `unread` as in `my_chat_overview`, and `message_count` counts the `state='sent'` messages and announcements the caller may see;
    - `going` and `everyone` ignore every block, so the blocked person's counts never move (G-B1);
    - Task 2 adds `rules_accepted`.
  - `private.notification_recipient_eligible` redefined, copied from plan 1. Not eligible when the recipient blocked the actor of a `chat_message` or `announcement` (the message's author), or of an `invited` notice (G-S13).
  - `private.request_connection` redefined, copied from **plan 2's** body. Its checks, in order (G-B2):
    1. `22023 'That is you'`;
    2. the two visibility refusals as today, `42501 'Names required'` and `42501 'Not on this resbite'`, which never depend on the pair;
    3. a block by the caller of `p_user` → `22023 'Unblock first'`;
    4. a block by `p_user` of the caller → insert `connection_refusals(series_id = the plan's series, from_user = caller, to_user = p_user, hidden = false) on conflict (series_id, from_user, to_user) do update set hidden = false`, queue nothing, and return `'requested'` (G-B1);
    5. then the pair row and every accept path, unchanged.

    A blocked person who asks where they may not ask gets the same 42501 as anyone, because the block checks come after the visibility refusals.
  - `private.plan_connection_states` redefined: `none` for people the caller blocked. `my_connections` is not redefined: no pair row survives a block, so it shows none already (CH-R-A5, confirmation B2).
  - `send_message` redefined, copied from plan 1. Its `chat_message` fan-out leaves out every recipient who blocked the author: `and not exists (select 1 from private.blocks b where b.blocker_id = r.id and b.blocked_id = v_uid)` (confirmation S2). The coalescing lock and rule stay as plan 1 has them, so a blocked author never takes a blocker's one row a minute. The eligibility check stays as the second guard. Task 2 adds its two checks to this same body.
  - `private.invite_contacts` redefined, copied from the circles migration with its non-host branch (G-S13). A phone item whose holder blocked the caller takes the unknown-number path (`'link'`): a personal invitation, and no attendee row, no notice and no `'app'` answer. The result never tells the inviter.

- [ ] **Step 1: Failing SQL test, slice 1** (`supabase/tests/chat-safety.sql`; ids use the hex prefix `e7` and emails `s3-…@resbite-test.invalid`, one rolled-back block per slice as `supabase/tests/connections.sql` does; every sender accepts the chat rules in the setup, written as a `do` block that runs the insert with `execute` only when `to_regclass('private.chat_rules_acceptances')` is not null, since the table arrives in Task 2 and a plain insert into a missing table fails at parse time (confirmation 2, SHOULD 3; CH-R-A8); owner 01, admin 02, guests 03, 04, 05 and 07 Going, 06 pending, 08 stranger; a one-off, a group, and a third plan of another series with 03 and 04 Going; 03 and 04 connected on the group's series), pinning the Review Focus:
```sql
-- 03 blocks 04: 03's chat_messages and chat_messages_since skip 04's messages and announcements and keep system lines.
--   05 still sees them.
-- S2: 04's new message queues no chat_message row for 03. The one for 05 is queued and eligible.
--   05 writes 20 seconds after 04: 03 has one chat_message row this minute, for 05's message, and it is eligible.
-- my_chat_overview and chat_summary for 03 never show 04's text as last. Their counts leave 04's messages out.
-- SHOULD 4, on the group with 05's message the newest row: 07 says Can't go, then Going within 10 minutes, so its
--   cant_go line reads state 'deleted'. For 03, my_chat_overview.last and chat_summary.last are 05's message.
-- G-B3 unread: 04's message is the newest row. 03 marks read the newest id 03 can see:
--   chat_summary.unread false and my_chat_overview unread false for 03.
-- 03 blocks host 02: 02's announcement (on the group's series, not the one-off, so S7's first announcement below is not 'Too fast') is hidden from 03 and not eligible for 03. chat_summary.pinned for 03 is null.
--   A place change by 02 still writes a line and queues a plan_changed notice to 03.
-- S7, on the one-off where 06 is pending: 02 announces to everyone. 06 blocks 02: a block row (02's announcement reaches 06).
--   Move that announcement's created_at back 61 seconds, so plan 1's 'Too fast' doesn't answer the next one.
--   02 announces to everyone again: my_chat_overview.announcements as 06 has no entry from 02.
-- G-B1 counts: chat_summary as 02 reads the same going and everyone before and after 03's block.
-- G-B1 connected: the block ends 03-04. No connections row, a hidden refusal from 04 to 03.
--   plan_connection_states as 04: 03 is 'none', as after a removal.
-- 03 asks 04: 22023 'Unblock first'.
-- G-B1 asking, from the third plan's series, where today's code would store a real request and push (NOTE 13):
--   04 asks 03 there: 'requested', a visible refusal from 04 to 03 on that series, no connections row, no outbox row.
--   plan_connection_states as 04 on the third plan: 03 is 'requested_by_me'.
-- G-B1 pending: 05 asks 03, then 03 blocks 05: no connections row, a visible refusal from 05 to 03.
--   plan_connection_states as 05: 03 is still 'requested_by_me'.
-- G-B2: 03 asks 07 and 07 says Not now (a refusal from 03 to 07). 03 blocks 07. 07 asks 03:
--   no connections row and no connection_accepted outbox row.
-- my_connections for 03 omits 04 (an outcome, with no redefinition behind it). Unblock 04: 04's messages reappear for 03, and no connection comes back.
-- Mutual blocks: 04 blocks 03, then 03 unblocks 04: 04 still does not see 03's messages.
-- G-N12: block_user as 03 on a random uuid: success, no row. On 08, whom 03 may not read: success, no row.
--   On a guest who wrote in the one-off's chat and was then removed (03 may read them only as an author): a row.
-- my_blocks as 03: [{user_id, name}] newest first, name the first word of display_name. After 04's deletion request: name null.
-- G-S13: 03 blocks 01. 01 invites 03's number by phone: kind 'link', no attendee row for 03, no 'invited' outbox row.
--   An 'invited' notice from 01 to 03 queued before the block is not eligible.
```
- [ ] **Step 2: Run** `bash scripts/test-database-docker.sh` → FAIL (`public.block_user` missing).
- [ ] **Step 3: Implement** section 1.
- [ ] **Step 4: Run** both modes → PASS. For now `after.sql` asserts that `private.blocks` exists with RLS on and no grants, and that `block_user` and `my_blocks` are executable by `authenticated` only.
- [ ] **Step 5: Commit:** `"Safety: blocks, and the block rule in every read and every way to connect"`

### Task 2: Migration section 2: reports, moderators, chat rules, blocked terms, deletion and the ops scripts

**Files:**
- Modify: `supabase/migrations/20261111160000_chat_safety.sql` (section 2), `supabase/tests/chat-safety.sql` (slice 2), `supabase/tests/chat.sql`, `supabase/tests/chat-groups.sql`, plan 1's `supabase/tests/local/chat-send-concurrency.sh` and this plan's own `supabase/tests/chat-safety.sql` (each sender accepts the chat rules in the setup, each a `do` block with `execute`, guarded by `to_regclass('private.chat_rules_acceptances')`, so plans 1 and 2 keep passing in both modes, confirmation S6), `supabase/tests/hosted-baseline/20261111160000_chat_safety.after.sql` (complete it)
- Create: `supabase/ops/open-reports.sql`, `supabase/ops/close-report.sql`, `supabase/ops/remove-reported-message.sql`, `supabase/ops/suspend-account.sql`, `supabase/ops/moderators.sql`, `supabase/ops/blocked-terms.sql`, `supabase/rollback/20261111160000_chat_safety.rollback.sql`, `supabase/tests/hosted-baseline/20261111160000_chat_safety.before.sql`

**Interfaces:**
- Consumes: section 1; plan 1's `send_message`, `send_announcement`, `private.request_account_deletion` (guarded by `to_regprocedure`, with its deletion flag), the outbox kind check (plan 1's list).
- Produces:
  - `private.reports`, RLS on, no policies, all revoked from the four roles, with these columns:
    - `id bigint generated always as identity primary key`;
    - `reporter_id uuid null references public.profiles(id) on delete set null`, `target_user_id uuid null`, `message_id bigint null references public.messages(id) on delete set null`, `series_id uuid null`, `plan_id uuid null`;
    - `reason text not null check (reason in ('harassment','spam','inappropriate','other'))`, `details text null check (details is null or char_length(details) <= 500)`;
    - `frozen_body text null`, `frozen_author uuid null`;
    - `created_at timestamptz not null default now()`;
    - `status text not null default 'open' check (status in ('open','reviewed','actioned'))`, `reviewed_at timestamptz null`, `review_note text null`;
    - `action text null check (action is null or action in ('none','message_removed','account_suspended','both'))` (G-B4(b)).
    - A unique index on `(reporter_id, message_id) where message_id is not null` (G-N12).
    - A unique index on `(reporter_id, target_user_id, series_id) where message_id is null and status = 'open'`: one open report per reporter, person and series (confirmation NOTE 8).
  - `private.moderators (user_id uuid primary key references public.profiles(id) on delete cascade)` (G-B4(c)). RLS on, no policies, all revoked.
  - `private.chat_rules_acceptances (user_id uuid not null references public.profiles(id) on delete cascade, version text not null, accepted_at timestamptz not null default now(), primary key (user_id, version))` (G-B4(d)). RLS on, no policies, all revoked.
  - `private.blocked_terms (term text primary key check (term = lower(btrim(term)) and char_length(term) between 1 and 80 and term !~ '[][\\.^$*+?(){}|]'))` (G-B4(a)). The check keeps regex characters out, so a term always matches literally. The migration seeds nothing. RLS on, no policies, all revoked.
  - `private.chat_rules_version() returns text`: `'2026-11'`, the one place the version lives. No grants.
  - `public.accept_chat_rules() returns void`, with `private.accept_chat_rules`: inserts (caller, `chat_rules_version()`) `on conflict do nothing`. Granted to `authenticated` only.
  - `public.chat_summary`, section 1's body, gains `rules_accepted` (bool: the caller accepted the current version). The app reads it as `rulesAccepted`.
  - Section 1's `send_message` body gains two checks, and `send_announcement` is redefined, copied from plan 1, with the same two:
    - after plan 1's membership and closed checks: no acceptance of the current version → `22023 'Rules not accepted'`;
    - after plan 1's body-length check: the body as plan 1 trimmed it (its own trim, the one that also strips U+00A0) matches a blocked term, `<that trimmed body> ~* ('\m' || term || '\M')`, → `22023 'Not allowed'`. One trim rule, plan 1's, serves both checks (confirmation 2, NOTE 6).
    - A repeated `client_id` still returns the existing row first, as plan 1 orders it.
  - `public.report_message(p_id bigint, p_reason text, p_details text default null) returns void`:
    - allowed when one of these holds, else `22023 'Report unavailable'` (G-S9, G-B4(e)):
      - the caller is `private.chat_member` of the message's series now;
      - the caller is a host of the message's `plan_id`, or has an attendee row on it: any reply on a group, and on a one-off only `accepted` or `maybe` (a member when it was written; confirmation NOTE 15);
      - the caller left the group after the message was written (a `series_leaves` row whose `left_at` is later than the message), since `leave_series` deletes the row on the occurrence they left;
      - the message is an announcement, and the caller is in `private.announcement_audience(series, audience)` now;
    - the same error for a `system` line, a message whose `state <> 'sent'`, or the caller's own message (G-N12);
    - freezes `body` and `author_id`. `target_user_id` is the author, and `series_id` and `plan_id` are the message's;
    - a second report by the same person of the same message stores nothing and returns the same success;
    - granted to `authenticated` only.
  - `public.report_user(p_user uuid, p_series uuid, p_reason text, p_details text default null) returns void`: allowed when some occurrence `o` of `p_series` has `private.can_see_guests(o)` for the caller, and `p_user` is its owner, an admin or has an attendee row on it (G-S9). It is also allowed when `p_user` wrote a `message` or `announcement` in `p_series` and the caller is `private.chat_member` of it now, the test `block_user` uses (confirmation S5). That reaches a one-off guest the host removed after they wrote. Otherwise, and for oneself, `22023 'Report unavailable'`. `plan_id` is the latest such occurrence, or the plan of the author's latest message there. A second open report by the same person about the same person on the series stores nothing, queues nothing, and returns the same success (NOTE 8). Granted to `authenticated` only.
  - Both report functions queue `report_filed` to every moderator but the reporter: `plan_id` the report's, `actor_id` null, `dedupe_key 'report:'||id||':'||moderator` (G-B4(c)).
  - `notification_outbox_kind_check` re-added with plan 1's list plus `report_filed`.
  - `notification_recipient_eligible`, section 1's body, gains a branch for `report_filed`: the recipient is in `private.moderators` now, `user_eligible`, not being deleted, and the row is under 24 hours old. No membership test and no mute apply. The first branch excludes the kind.
  - The deletion function (`private.request_account_deletion`, guarded by `to_regprocedure`), copied from plan 1's body with its `set_config('resbite.system','deletion',true)` kept. It also deletes the person's blocks both ways, the reports they filed (G-S11), their `chat_rules_acceptances` rows and their `moderators` row. Reports about them stay.
  - Ops scripts, plain SQL for the SQL editor (G-S12):
    - `open-reports.sql`, read-only: the open reports, oldest first, with exactly these columns in this order: `id, created_at, reason, details, frozen_body, reporter_name, target_name, resbite_title, resbite_date` (G-S14). No phone number or email.
    - `close-report.sql`: one `values` row at the top, `(report_id, status, action, note)`. It sets `status`, `action`, `review_note` and `reviewed_at = now()` in one transaction, and prints the updated row.
    - `remove-reported-message.sql`: one literal at the top, the report id. It sets the reported message's `state = 'removed'`, `body = null` and `payload = jsonb_build_object('by','resbite')` while it is still `sent`, and prints the message id and state (CH-R-A3). `'resbite'` is not a uuid, so `chat_names` leaves it out. The report stays open until `close-report.sql` records the action (G-B4(b)).
    - `suspend-account.sql`: one literal at the top, the report id. For the report's target it sets their `private.tester_roster` row's `enabled = false` and revokes their live grant in `private.beta_access`. It prints the two counts. The runbook adds the Auth dashboard ban as an owner step.
    - `moderators.sql`: one list of emails at the top. It replaces `private.moderators` with the accounts holding those emails, and prints the count and each email with no account.
    - `blocked-terms.sql`: one list of terms at the top, empty in the repository. It replaces `private.blocked_terms` with the list (lowercased, trimmed, without duplicates) and prints the count, never the terms. The owner pastes the list into the SQL editor's copy only.
  - Rollback, `supabase/rollback/20261111160000_chat_safety.rollback.sql`, in this order:
    - delete the `report_filed` outbox rows;
    - restore plan 1's kind check, `notification_recipient_eligible`, `chat_messages`, `chat_messages_since`, `my_chat_overview`, `send_message`, `send_announcement` and the deletion body (where it exists);
    - restore plan 2's `chat_summary` and `request_connection`, the connections migration's `plan_connection_states`, and the circles migration's `invite_contacts`;
    - drop `block_user`, `my_blocks`, `report_message`, `report_user` and `accept_chat_rules` in both schemas, and `chat_rules_version`;
    - drop `blocks`, `reports`, `moderators`, `chat_rules_acceptances` and `blocked_terms`.

    Its header says what is lost: every block, report, moderator, acceptance and blocked term. It also says to roll back in reverse order only, this plan first, then plan 2's, then plan 1's (G-N11).

- [ ] **Step 1: Failing SQL test, slice 2.** Each ops script is read as text through `:resbite_repo` (a backtick `cat`, as `20261030130000_phone_key.after.sql:91` does), with its top literal swapped by `sed`, and run as postgres.
```sql
-- Rules: 03 sends before accept_chat_rules: 22023 'Rules not accepted'. 02 announces before accepting: the same.
--   accept_chat_rules as 03, twice: one row, version '2026-11'. chat_summary.rules_accepted for 03 true, for 05 false.
--   Then 03 sends: ok. After these assertions, the slice's other senders (02, 04, 05, 10) accept the rules before they send (SHOULD 3).
-- Blocked terms: insert 'zzbadword'. 'this has ZZBADWORD in it': 22023 'Not allowed'. 'zzbadwords': sent.
--   An announcement holding it: 'Not allowed'. Inserting 'a.b': check_violation.
-- report_message by 05 on 04's message: a row with frozen_body, frozen_author 04, target 04. 04 deletes it: the report is unchanged.
--   The same report again: success, still one row, no second report_filed row.
--   08 (stranger): 22023 'Report unavailable'. 05 on a system line, on a deleted message, on its own message: the same error.
--   04 leaves the group (plan 2). 04 reports a message written that week before leaving: a row (left after it).
--   04 reports a message from the previous occurrence, where 04's row stays: a row.
--   06 (pending on the one-off) reports 02's 'everyone' announcement: a row.
--   NOTE 15: 06 reports 04's plain message on the one-off: 22023 'Report unavailable' (a pending row there is not enough).
--   After the chat closes: 05 reports another message of 04's: a row.
-- report_user by 05 about 04 on the series: a row whose plan_id is the latest occurrence they share. About 08: 'Report unavailable'.
--   NOTE 8: the same report again while open: success, still one row, no second report_filed row.
--   After close-report.sql closes it: a new report stores a row.
--   S5: 10 writes in the one-off's chat, then 01 removes 10. report_user by 05 about 10 on the one-off's series: a row,
--   whose plan_id is the one-off.
--   Reasons outside the four: check_violation. Details of 501 characters: check_violation.
-- Moderator push: 09 in private.moderators. A report by 05 queues one report_filed row to 09, dedupe 'report:<id>:09', eligible.
--   A report by 09 queues none to 09. 09 removed from moderators: the queued row is not eligible.
-- Deletion (guarded): 03's blocks both ways are gone. 05's deletion deletes 05's reports.
--   Reports about 04 stay after 04's deletion, with frozen_body. 03's acceptance row and 09's moderators row go with their deletions.
-- open-reports.sql, run as 'create temporary table … as <script>': its column names, in order, are exactly
--   id, created_at, reason, details, frozen_body, reporter_name, target_name, resbite_title, resbite_date.
-- close-report.sql with (report_id, 'actioned', 'both', 'Removed and suspended'): status, action, review_note and reviewed_at set.
-- remove-reported-message.sql on 05's report: the message reads state removed, body null, payload {"by": "resbite"}.
--   chat_messages as 05 returns that payload, and its names map has no 'resbite' key. A second run changes nothing.
-- S6 needs no assertion here: plan 1's chat-send-concurrency.sh passes in full mode with its guarded acceptance.
-- suspend-account.sql on a report about 04: user_eligible(04) false.
-- moderators.sql with one email: one row. blocked-terms.sql with two terms: two rows. With the empty list: none.
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** section 2, the six scripts and the rollback. Add the rules acceptance, a `do` block with `execute` behind the `to_regclass` guard, to the setups of `chat.sql`, `chat-groups.sql` and `chat-send-concurrency.sh`. In `chat-safety.sql`, slice 1's setup already has it, and slice 2 adds it after its rules assertions.
- [ ] **Step 4: Rehearsal files.** `before.sql` asserts none of the five tables exists. `after.sql` asserts:
  - the five tables exist with RLS on, no policies and no grants;
  - `blocked_terms` and `moderators` are empty (the migration seeds nothing);
  - `block_user`, `my_blocks`, `report_message`, `report_user` and `accept_chat_rules` are executable by `authenticated` only;
  - the kind check admits `report_filed`;
  - inside a transaction that ends in `rollback`, as `20261110120000_connections.after.sql` does, the rollback restores each previous body exactly (`pg_get_functiondef`), leaves none of the five tables, and leaves no `report_filed` outbox row.
- [ ] **Step 5: Run** both modes → PASS. Record `sha256sum` of the migration and the rollback.
- [ ] **Step 6: Commit:** `"Safety: reports, moderators, chat rules and blocked terms, and the team's scripts"`

### Task 3: The sender: the moderators' push

**Files:**
- Modify: `supabase/functions/_shared/notification-copy.ts`, `notification-copy.test.ts`, `notification-engine.ts` (`payloadFor`), `notification-engine.test.ts`; `mobile/src/services/pushRegistration.ts` (`parseNotificationTarget`), `mobile/src/services/pushTaps.ts` (`isPlanUpdateTap`) and plan 1's `mobile/src/domain/reminders.ts` (`showsInForeground`), with their tests

**Interfaces:**
- Consumes: Task 2's `report_filed` outbox rows, claimed as every other kind is.
- Produces:
  - `notificationCopy({ kind: "report_filed", … })` → `{ title: "Resbite", body: "A new report is waiting." }`, whatever else the row carries. No resbite title, name or text of the report.
  - `payloadFor` for `report_filed`: `data = { type: "report", notificationId }`, with no `planId`, and the same `ttl` as the others.
  - The app: `parseNotificationTarget({ type: "report", notificationId })` returns null, and `isPlanUpdateTap` (`pushTaps.ts:13`) is false for it. A tap opens the app where it was and routes nowhere.
  - Plan 1's `showsInForeground(identifier, data, focusedSeries)` shows a `report` push, so a moderator with the app open still sees "A new report is waiting." (confirmation NOTE 7).

- [ ] **Step 1: Failing tests:**
  - `notificationCopy` for `report_filed`, with a title and an actor name present, gives exactly `{ title: "Resbite", body: "A new report is waiting." }`;
  - `payloadFor` for `report_filed` gives `data` with exactly the keys `type` ("report") and `notificationId`;
  - `parseNotificationTarget({ type: "report", notificationId: "7" })` → null, and `isPlanUpdateTap` on a response carrying it → false;
  - `showsInForeground("remote-1", { type: "report", notificationId: "7" }, null)` → true, and with a chat focused → true.
- [ ] **Step 2: Run** the loader command on both edge files and `node --import tsx` on the app test → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all `_shared/*.test.ts` and `npm run check` → PASS.
- [ ] **Step 5: Commit:** `"Safety: the moderators' push says only that a report is waiting"`

### Task 4: The app's safety model: words, gateway, people actions, the reload

**Files:**
- Create: `mobile/src/domain/safetyCopy.ts` and test, `mobile/src/services/safety.ts` and test
- Modify: `mobile/src/domain/eventPage.ts` and test (`PersonAction`, `PersonRow.blocked`, `peopleGroups`), `mobile/src/state/chatModel.ts` and test (`afterBlockChange`), plan 1's `mobile/src/domain/chatCopy.ts` and `chatRules.ts` with their tests (`removedByResbite`, `messageLabel`, `rowText`), `mobile/src/services/chat.ts` and test (`ChatSummary.rulesAccepted`, `chatErrorMessage`, `needsChatRules`), `mobile/package.json` (`test` chain)

**Interfaces:**
- Produces:
  - `SAFETY_COPY` (exact):
    - the report sheet: `report: "Report"`, `reportMessage: "Report message"`, `reportPerson: (name) => \`Report ${name}\``, `reportOrBlock: "Report or block"`, `why: "What's wrong?"`, `reasons: { harassment: "Harassment", spam: "Spam", inappropriate: "Not appropriate", other: "Something else" }`, `detailsLabel: "Anything else? (optional)"`, `sendReport: "Send report"`, `pickReason: "Pick a reason to send the report."`, `thanks: "Thanks. The Resbite team will look at it."`;
    - block and unblock: `block: (name) => \`Block ${name}\``, `unblock: (name) => \`Unblock ${name}\``, `blocked: "Blocked"`, and `blockQuestion(name, youHost, theyHost)` (G-N9, the person's name, never a pronoun):
      - `youHost` true: \`Block ${name}? You won't see ${name}'s messages or announcements, and you won't be able to remove ${name}'s messages.\`;
      - `theyHost` true only: \`Block ${name}? You won't see ${name}'s messages or announcements, and ${name} won't know.\`;
      - neither: \`Block ${name}? You won't see ${name}'s messages, and ${name} won't know.\`;
    - errors: `unavailable: "You can't report that any more."`, `unblockFirst: "Unblock this person first."`, `notAllowed: "That message can't be sent."` (G-B4(a));
    - the chat rules (G-B4(d)): `rulesTitle: "Chat rules"`, `rules: "Be kind. No harassment, hate, threats or spam. Messages that break these rules are removed, and people who break them can lose their account."`, `agree: "I agree"`;
    - blocked people (G-S10): `blockedPeople: "Blocked people"`, `noneBlocked: "You haven't blocked anyone."`;
    - contact (G-N10): `contact: (address) => \`Questions, or something wrong in a chat? Write to ${address}.\``, `copyAddress: "Copy address"`, `copied: "Copied"`;
    - reports on Data & privacy (G-S11): `reportsPrivacy: "If someone reports a message, the Resbite team reads it, and keeps a copy with the report even if the message or account is deleted."`.
  - `supportAddress(env: string | undefined): string | null`: trimmed, null when empty.
  - `thanksLines(address: string | null): string[]`: `[thanks]`, or `[thanks, contact(address)]` when set (G-N10).
  - `showsReportOrBlock(otherPeople: number): boolean`: false at 0 (G-N7).
  - `ReportTarget = { kind: "message"; id: number } | { kind: "user"; userId: string; series: string; name: string }` (G-N6).
  - `createSafetyGateway(rpc, deadline?)` → `{ block(userId), unblock(userId), myBlocks(), reportMessage(id, reason, details?), reportUser(userId, series, reason, details?), acceptRules() }`:
    - `block_user` with `{p_user, p_block: true}`, and `{p_user, p_block: false}` for unblock;
    - `my_blocks` mapped to `{ userId, name }[]`;
    - `report_message` with `{p_id, p_reason, p_details}`, `p_details` null when absent;
    - `report_user` with `{p_user, p_series, p_reason, p_details}`;
    - `accept_chat_rules` with `{}`.
  - `safetyErrorMessage(e)`: `'Report unavailable'` → `unavailable`, `'Unblock first'` → `unblockFirst`, else `INVITE_COPY.offline` (G-N6).
  - `ChatSummary` gains `rulesAccepted: boolean`. `chatErrorMessage` (plan 1) maps `22023 'Not allowed'` → `SAFETY_COPY.notAllowed`. `needsChatRules(e)` is true for `22023 'Rules not accepted'`.
  - `PersonAction` gains `report`, `block` and `unblock`. `PersonRow` gains `blocked: boolean`. `peopleGroups(i)` takes `blocks: ReadonlySet<string>`:
    - every row with a `userId` other than the viewer's gets `report`, then `block`, or `unblock` when the person is in `blocks`;
    - `request` rows get `block` or `unblock` only, never `report` (G-S9);
    - a blocked person's row has no connection actions and `blocked: true`, which shows the badge to the blocker only.
  - `afterBlockChange(cached, newest)` in `chatModel.ts` returns `newest`: the cached list goes, older pages included (G-S8).
  - `CHAT_COPY.removedByResbite: "Message removed by Resbite"` (CH-R-A3). A row with `state = 'removed'` and `payload.by = 'resbite'` uses it in the bubble, in `messageLabel` and in `rowText`. Every other removed row keeps plan 1's `removed`, "Message removed by an admin".

- [ ] **Step 1: Failing tests:**
  - every string, exactly, with the three block questions for "Ana";
  - each gateway call and its arguments;
  - `safetyErrorMessage` for both errors and its fallback; `chatErrorMessage` for `'Not allowed'`; `needsChatRules`;
  - `supportAddress(undefined)` and `supportAddress("  ")` give null; `supportAddress(" help@x.example ")` gives `"help@x.example"`;
  - `thanksLines(null)` gives one line; `thanksLines("help@x.example")` gives the thanks and "Questions, or something wrong in a chat? Write to help@x.example.";
  - `showsReportOrBlock(0)` false, `showsReportOrBlock(1)` true;
  - `peopleGroups`: every other row gets `report` and `block`; `unblock` instead of `block` for a person in `blocks`; a `request` row gets `block` and no `report`; a blocked row has no `connect` and `blocked: true`; the viewer's own row has none of them;
  - `afterBlockChange`: cached [Leo 5, Mia 6, Leo 7] and newest [Mia 6, Ana 8] give [Mia 6, Ana 8]. After an unblock, newest [Leo 5, Mia 6] gives Leo 5 back;
  - `CHAT_COPY.removedByResbite` exactly. `rowText` and `messageLabel` of a removed row with `payload {by: "resbite"}` say "Message removed by Resbite", and of a host's removal (no payload) "Message removed by an admin".
- [ ] **Step 2: Run** each with `node --import tsx` → FAIL.
- [ ] **Step 3: Implement,** and append the new tests to `package.json`.
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5: Commit:** `"Safety: the app's words, gateway and people actions for report and block"`

### Task 5: Report, block and the chat rules on screen

**Files:**
- Create: `mobile/src/design/ReportSheet.tsx`, `mobile/src/design/ChatRulesSheet.tsx`
- Modify: `mobile/app/chat.tsx` (long-press "Report message"; a tap on an author's name opens their sheet; the menu's "Report or block"; the rules sheet before a first send), `mobile/src/state/useChat.ts` (reload and replace after a block or unblock; a send waits for the rules), `mobile/app/guests.tsx` (Report, Block and Unblock in the person's sheet; `ACTION_ICON`; a `"report"` sheet view), `mobile/src/state/useEvent.ts` (reads `my_blocks` beside the connection states), `mobile/scripts/verify-chat.mjs` (the shared summary fixture gains `rules_accepted: true`), `mobile/scripts/verify-event.mjs`, `mobile/app/(tabs)/plans.tsx` and `mobile/src/design/kit.tsx` (`CoverCard` gains `onLongPress?` and its `accessibilityActions`), `mobile/scripts/review-ui.mjs`

**Interfaces:**
- Consumes: Task 4; `useEvent` for the current occurrence's people (G-N6); plan 1's `my_chat_overview` entries with their `id` (confirmation S7).
- Produces:
  - `ReportSheet({ target, onDone })`, with `target` a `ReportTarget`:
    - the four reasons as a radio group (`accessibilityRole="radio"`, `accessibilityState={{ checked }}`);
    - the optional field with `maxLength={500}`;
    - Send report stays disabled until a reason is picked, with `pickReason` as its hint;
    - on success, `thanksLines(supportAddress(...))` in place, announced with `AccessibilityInfo.announceForAccessibility`;
    - on failure the sheet stays open with the typed text and the line from `safetyErrorMessage`;
    - at Larger Text the sheet scrolls with the keyboard open (G-N7);
    - the reporter keeps using the chat.
  - `ChatRulesSheet({ onAgree, onCancel })`: `rulesTitle`, `rules`, a primary `agree` and `CHAT_COPY.cancel`.
  - **The chat's people** come from `useEvent(summary.planId)` for the current occurrence: its guests, connection states and `my_blocks` (G-N6). The menu's "Report or block" lists them, blocked people with Unblock. The entry is hidden when `showsReportOrBlock` is false.
  - **A tap on an author's name** opens that person's sheet. An author no longer on the current occurrence (left or removed) gets a sheet with Report and Block only, named from the `names` map.
  - **Long-press** offers Report message only on someone else's `message` or `announcement` in state `sent` (G-N12).
  - **A removed row** reads "Message removed by Resbite" when its payload says so (CH-R-A3, Task 4).
  - **The invitation card's announcement line** (confirmation S7). On My resbites, a long-press on a pending invitee's card that shows an announcement offers "Report message" (`ReportSheet` with `{kind: "message", id: <overview entry id>}`) and "Block <name>" (the confirm `blockQuestion(name, false, true)`). The same two are `accessibilityActions` on the card. After a block the overview is read again, and the line goes.
  - **The block confirm** reads `blockQuestion(name, youHost, theyHost)`. After a block from an author's name, focus moves to the sheet's result line, `blocked` (G-N7).
  - **After a successful block or unblock,** `useChat` reloads the summary and the newest page with `chat_messages`, and replaces the list through `afterBlockChange` (G-S8).
  - **Sending before the rules are accepted** (G-B4(d)):
    - with `summary.rulesAccepted` false, Send and Send announcement open the rules sheet first;
    - a send refused with `needsChatRules` opens it too, and keeps the item queued with its client id;
    - I agree calls `acceptRules()`, then sends the waiting item with the same client id;
    - Cancel leaves the item "Not sent. Tap to retry.".
  - **The person's sheet,** on the people list and in the chat: "Report <name>", then "Block <name>" (red, in-place confirm) or "Unblock <name>". The connection actions hide while blocked. A "Blocked" badge on the row shows to the blocker only.

- [ ] **Step 1: Extend `verify-chat.mjs`.** The labels s1 to s10 keep clear of plans 1 and 2.
  - (s1) Long-press on Leo's message → Report message. The reasons are radios, and Send report is disabled with the hint `pickReason`. Spam → Send → `report_message` with `{p_id, p_reason: "spam", p_details: null}`, then the thanks line.
  - (s2) The same, answered offline: the sheet stays, the typed details stay, and the error line shows.
  - (s3) Long-press on one's own message, and on a system line: no Report message.
  - (s4) The menu → Report or block → Leo → Block Leo. The confirm reads "Block Leo? You won't see Leo's messages, and Leo won't know." Confirm → `block_user` with `{p_user, p_block: true}`. Then `chat_messages`, not `chat_messages_since`, is called, and no bubble by Leo remains (G-S8, G-S14).
  - (s5) As a host blocking a guest, the confirm reads "Block Leo? You won't see Leo's messages or announcements, and you won't be able to remove Leo's messages."
  - (s6) A tap on an author's name → Block → confirm: focus lands on "Blocked".
  - (s7) With `rules_accepted: false`, Send opens "Chat rules". Cancel sends nothing. I agree calls `accept_chat_rules`, then `send_message` with the same `p_client_id`.
  - (s8) A send answered `22023 'Not allowed'` shows "That message can't be sent."
  - (s9) Alone in the chat, the menu has no Report or block.
  - (s10) A row with state `removed` and payload `{by: "resbite"}` shows "Message removed by Resbite". A host's removal, with no payload, shows "Message removed by an admin" (CH-R-A3).

  `verify-event.mjs`:
  - the people sheet shows Report and Block;
  - a waiting join request's sheet shows Block and no Report;
  - a blocked person's row shows "Blocked" and no Connect.

  `review-ui.mjs`, on `/plans` (confirmation S7):
  - a pending invitee's card with "Announcement from Ana · Doors open at 19:30": a long-press → Report message → Spam → Send calls `report_message` with the overview entry's `id` as `p_id`;
  - a long-press → Block Ana → the confirm reads "Block Ana? You won't see Ana's messages or announcements, and Ana won't know." Confirm calls `block_user` with `{p_user, p_block: true}`, then `my_chat_overview` again, and the line is gone.
- [ ] **Step 2: Run** with Expo web → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run check`, `verify-chat.mjs`, `verify-event.mjs`, `review-ui.mjs` → PASS.
- [ ] **Step 5: Commit:** `"Safety: report, block and the chat rules from a message, a person, the chat and the invitation card"`

### Task 6: Blocked people, the contact address and Data & privacy

**Files:**
- Create: `mobile/app/blocked-people.tsx` (route `/blocked-people`)
- Modify: `mobile/app/_layout.tsx` (its Stack entry), `mobile/app/data-privacy.tsx` (a "Blocked people" row, a "Contact" topic, the reports line in plan 1's "Chat messages" topic), `mobile/scripts/verify-deletion.mjs` (the script that covers the Privacy screen at `3b5be48`)

**Interfaces:**
- Consumes: Task 4's gateway and copy; `expo-clipboard`, already a dependency (`mobile/package.json:25`); `Linking`, as `mobile/src/design/TickRow.tsx:91` opens the Terms.
- Produces:
  - **Blocked people** (G-S10): a Row on Data & privacy, after the topics, opening `/blocked-people`. The screen lists `my_blocks` by name, "Someone" when null, each with "Unblock <name>", which acts at once. With nobody: `noneBlocked`. A failed read shows the error line with Try again. A failed unblock keeps the row and shows `safetyErrorMessage`.
  - **A "Contact" topic,** shown only when `supportAddress(process.env.EXPO_PUBLIC_SUPPORT_ADDRESS)` is not null (G-N10): the `contact(address)` line with the address as selectable text, a "Copy address" button (`expo-clipboard`, then `copied` announced), and the address as a `mailto:` link opened through `Linking`.
  - **Plan 1's "Chat messages" topic** gains `reportsPrivacy` (G-S11).

- [ ] **Step 1: Failing checks** in `verify-deletion.mjs`, in two runs, since `EXPO_PUBLIC_*` is inlined when the bundle is built (G-S14):
  - Expo started without the variable: no Contact topic and no empty placeholder. The Blocked people row opens the screen. With `my_blocks` answering Leo, "Unblock Leo" calls `block_user` with `{p_user, p_block: false}` and the row goes. With nobody, "You haven't blocked anyone." The "Chat messages" topic shows `reportsPrivacy`.
  - Expo restarted with `EXPO_PUBLIC_SUPPORT_ADDRESS=help@x.example`, and the script run with `EXPECT_SUPPORT=help@x.example`: the Contact topic shows "Questions, or something wrong in a chat? Write to help@x.example.", the address is selectable (`user-select: text` on web), Copy address is a button, and the link's `href` is `mailto:help@x.example`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run check` and both runs → PASS.
- [ ] **Step 5: Commit:** `"Safety: blocked people, the contact address and what a report keeps"`

### Task 7: The App Store notes, the release runbook and the record

**Files:**
- Create: `qa/chat-release/app-store-review-notes.md`
- Modify: `qa/chat-release/README.md` (complete it), `knowledge-base/08-decisions.md`, `docs/implementation-status.md`

**Interfaces:**
- Produces:
  - The App Store review notes, which say:
    - how to reach a chat with the review account;
    - that everyone agrees to the chat rules before writing, and that a blocked-terms check stops messages before they are stored (the filtering of 1.2);
    - where Report and Block are (a message's long-press, a person's sheet, the chat menu), and where a block is undone;
    - that each report pushes the Resbite team, who check the queue daily, and remove content and suspend accounts within 24 hours;
    - the contact address.
  - The completed release runbook, each step with its owner approval, in this order:
    1. Before snapshot. Approve the three migrations (`20261111140000_chat_core`, `20261111150000_chat_groups`, `20261111160000_chat_safety`) by name and sha256, and apply them in order with the history repair after each. After snapshot and advisors (expected: `rls_enabled_no_policy` INFO on the new public tables, nothing above INFO). Any rollback goes in reverse order only: plan 3's, then plan 2's, then plan 1's (G-N11).
    2. **Realtime "Allow public access" off** (owner, dashboard).
    3. The sender redeploy (the chat pushes and `report_filed`).
    4. In the SQL editor: `supabase/ops/moderators.sql` with the moderators' emails, and `supabase/ops/blocked-terms.sql` with the owner's list. **Release gate:** `select count(*) from private.blocked_terms` is above 0, and `private.moderators` has at least one row. Otherwise the release waits.
    5. **`EXPO_PUBLIC_SUPPORT_ADDRESS` set in the EAS production environment,** checked with `npx eas env:list --environment production`. Submission is blocked until it is set.
    6. The TestFlight build and submit, with the review notes pasted into App Store Connect.
    7. Device checks for core, groups and safety:
       - a blocked person's messages, pinned card and unread dot are gone on the blocker's phone;
       - the blocked phone sees "Request sent" after asking;
       - a report reaches the moderator's phone as "A new report is waiting.", and its tap opens nothing;
       - the rules sheet comes before a first message;
       - a blocked term is refused;
       - the report sheet scrolls at the largest text size with the keyboard open.
    8. Reading the reports queue, in the SQL editor:
       - the moderator's push, plus a daily run of `open-reports.sql`;
       - for each report, `remove-reported-message.sql` and `suspend-account.sql` as needed;
       - for a suspension, the Auth dashboard ban (owner);
       - then `close-report.sql`, recording which action was used;
       - target: within 24 hours of the report.
  - Decisions log: this plan's Decisions 1 to 13.

- [ ] **Step 1: Write** the notes and the runbook.
- [ ] **Step 2: Full check:** `bash scripts/test-database-docker.sh`, `(cd mobile && npm run check)`, the edge tests → PASS ×3.
- [ ] **Step 3: Commit:** `"Safety: the review notes and the release runbook"`
