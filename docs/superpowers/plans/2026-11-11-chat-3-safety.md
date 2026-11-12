# Report and Block Implementation Plan (chat plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can report a message or a person and block a person. A block hides that person's messages and pushes everywhere and ends any connection, and the blocked person can't tell. A first message waits for the chat rules, and a blocked-terms list stops the worst words. Each report pushes the Resbite team, who have scripts to read, close, remove and suspend. The app shows a contact address. Together these meet App Store guideline 1.2.

**Architecture:** One migration in two sections. Section 1 adds blocks and the block rule in the chat reads, the push eligibility, the connection functions and `invite_contacts`. Section 2 adds reports, moderators and the `report_filed` notice, the chat-rules acceptance, the blocked-terms filter and the deletion step. Six owner-run scripts for the SQL editor read and close reports, remove a reported message, suspend an account, and set the moderators and the blocked terms. The sender words the moderators' push. The app gets a report sheet, a block confirm, the chat-rules sheet and a "Blocked people" screen, reachable from a message, a person's sheet, the chat menu and Data & privacy. The support address comes from the EAS environment. This plan also completes the release runbook for all three chat plans.

**Tech Stack:** as chat plan 1.

**Spec:** `docs/superpowers/specs/2026-11-10-groups-and-chat-design.md` CH-P13, CH-P18 and the Anti-goals; `docs/superpowers/specs/2026-11-10-connections-and-circles-design.md` CO-P3 (a refusal is invisible) and CO-P14 (a block ends a connection and refuses new ones).

**Branch:** `ch3-safety`, stacked on `ch2-groups` once plan 2 is built and reviewed, the way `ch2-groups` was made on `ch1-core` at `43f4416` (or from main if the stack is merged first). Ships in the same release as plans 1 and 2.

**Tasks:** 7.

## Revised 12 November 2026 (after chat core was built)

Chat core (plan 1) is built and reviewed on `ch1-core` at `43f4416`. Its migration `supabase/migrations/20261111140000_chat_core.sql` has sha256 `1047fb379a4e8a942b49db3f7134674caecf2cbb30f67e0ebf9f0f2fea6a78ce`, and every `chat_core.sql:N` below is a line of that file. This revision brings the plan in line with what was built: the notes chat core left (`.superpowers/sdd/challenges/chat-1-notes-for-plans-2-3.md`, binding), its code, and its ledger's rulings (H1–H43). **Where this plan copies a chat core body to extend it, it copies the body as built at that hash, and its rollback restores that exact body.** Plan 2's bodies (`chat_summary`, `request_connection`) are copied from plan 2 as built. Each correction, old → new with the built file and line, is in `.superpowers/sdd/challenges/chat-2-3-after-core.md`. Where the rulings' Shared interfaces table and the built code differ, the built code wins.

What changed, one line each:
- **Branch:** stacked after plan 2, as plan 2 is on chat core.
- **Copied bodies (Tasks 1, 2):** each as built, with lines:
  - `private.chat_messages` (`chat_core.sql:284-293`), `private.chat_messages_since` (:304-317) and `private.my_chat_overview` (:334-364);
  - `private.send_message` (:464-504) and `private.send_announcement` (:513-555);
  - `private.notification_recipient_eligible` (:652-692);
  - the guarded `private.request_account_deletion` (:814-877);
  - the outbox's 13 kinds (:379-382).

  Only the private bodies change; the public wrappers (with `chat_messages`' defaults, :295-300) stay. Chat core made most of them with `create function`, so this plan writes `create or replace function`.
- **The blocked author's rows (Task 1):** the filter goes inside each read's inner `select … limit` (:289-291, :312-315), before the limit. A page must still hold `p_limit` rows the caller may see, since the app reads a short newest page as "nothing earlier" (`chatSession.ts:329`, `hasEarlier: … page.rows.length >= NEWEST_PAGE`) and a full `since` answer of 200 as a gap (`chatModel.ts:9`).
- **`my_chat_overview` as built (Task 1):** `last` is the chat's `last_message_id` row and `count` is `chats.message_count` (:343-345), so both become per caller. `announcements` is the latest sent announcement whose audience includes the caller, not only `everyone` ones (H22, :351-362), and keeps its `id` (SHOULD 7).
- **`my_blocks` names (Task 1):** through `private.chat_first_name` (:201-203), the names map's own helper.
- **`send_message`'s fan-out (Task 1):** the built alias is `r.id` over `private.chat_members(p_series) as r(id)` (:494-501), as this plan's clause assumed. The claim's read-skip (:714-717) and the one-a-minute test work on queued rows, so leaving blockers out at the fan-out is enough.
- **Where the two new checks go (Task 2):**
  - "Rules not accepted" right after the `chat_open` check (:474, :524);
  - "Not allowed" right after `private.chat_body` returns a body (:475-476, :525-528), on that body (`v_body`): chat_body's trim, and over 16,000 bytes refused before any pattern (H42).
- **`report_filed` and the worker (Tasks 2, 3):**
  - the claim expands and picks every non-chat kind first (:712, :743), so a report push never waits behind a lively chat;
  - the claim inner-joins `plans` (:767), and `payloadFor` refuses a job whose `plan_id` isn't a uuid (`notification-engine.ts:86-95`), so every `report_filed` row needs the report's `plan_id`;
  - `report_filed` joins the first eligibility branch's exclusions (:657).
- **The sender (Task 3):** `data` is built in `dataFor` (`notification-engine.ts:68-85`), which `payloadFor` wraps (:86-102); the words go in `notificationCopy` (`notification-copy.ts:167-203`).
- **Sign-out (Task 3):** `"report"` joins `PUSH_TYPES` (`pushRegistration.ts:167`), "every `data.type` Resbite's sender sets". So sign-out's `dismissShownPushes` (`pushDevice.ts:349-358`, H39) clears a moderator's push too. `parseNotificationTarget` still returns null for it, since it has no `planId`; `isPlanUpdateTap` (`pushTaps.ts:13-18`) already answers false.
- **After a block or unblock (Tasks 4, 5):** chat core built `replace()` for this (`chatSession.ts:836-842`, `useChat.ts:35-36`; H25 Q3). `afterBlockChange` goes, and the screen calls `chat.replace()`.
- **A rules refusal reaching the screen (Task 5):**
  - the session marks every refused queued message failed, to be sent again only by a tap with its own client id (`chatSession.ts:703-713`), and keeps an announcement's client id for the same text and audience (:922-924);
  - the screen sees only the error text, so the session must say that it was the rules, as it re-reads the summary after 'Hosts only' (:389-392);
  - (s7) splits into the sheet before a send and the sheet after a refusal.
- **Long-press Report (Tasks 4, 5):** `MessageAction` and `messageActions` (`chatFeed.ts:11`, :100-104) are where "Plan 3 appends Report". The action sheet (`chat.tsx:644-668`) draws every action as a red delete today, so Report opens the report sheet.
- **"Message removed by Resbite" (Task 4):** the words come from `words` (`chatRules.ts:242-247`, for `rowText` and `messageLabel`) and from `wordsOf` (`chatFeed.ts:107`, for the bubble and the announcement card); both change.
- **Copy (Task 4):** the app's strings write the apostrophe as ’ (U+2019; `chatCopy.ts:42`, :47, :50; H37 Q7), so `SAFETY_COPY`'s do too: "What’s wrong?", "You won’t see…", "That message can’t be sent." and the rest.
- **Names in Blocked people (Tasks 4, 6):** read through the chat's name cleaning (`cleanName`, `chatRules.ts:126`), as every name in a chat is. Chat core's note on `oneLine` (it keeps ZWSP and LRM/RLM, which `cleanText` removes) is settled that way. This plan shows no report preview.
- **`focusedChat` (Task 5):** a block keeps the chat on screen (`replace()`), and leaving the screen runs its focus cleanup (`chat.tsx:161-170`). So no path here needs `setFocusedChat(null)` of its own, unless one hides the chat without leaving its screen.
- **Data & privacy (Task 6):** the Chat messages topic is `data-privacy.tsx:90-101`, and `review-ui.mjs:140-143` checks its exact text, so that check changes with `reportsPrivacy`.
- **Runbook (Task 7):** chat core wrote steps 0 to 8, the owner scripts `ch1-*.sh`, Rollback and Known gaps (`qa/chat-release/README.md`). This plan's steps join those numbers rather than replace them. The advisors expect no new `rls_enabled_no_policy` line from plans 2 and 3, whose tables are all in `private`.
- **Rehearsals (Task 2):** chat core's `create function` text runs as `create or replace` when bodies are compared. The deletion body is restored inside its `to_regprocedure` guard, as chat core wrote it.
- **Confirmed unchanged by the build:**
  - the three-argument `chat_messages_since` and `{rows, names, as_of}`;
  - the overview entry's `id` (S7);
  - `chat_names` reads only `actor`, `user` and `brought_by`, so `payload.by` is never looked up;
  - `e7` and the emails `s3-` are still unused;
  - (s1) to (s10) are clear of plan 1's (s) (`verify-chat.mjs:1211`);
  - the migration name `20261111160000_chat_safety` doesn't clash.

**Open question (chat core's build raised it; neither the code nor the spec settles it):**
- **Q1. Report and Block from the announcement line where else it shows.** This plan puts them on the invitation card in My resbites (confirmation S7). Chat core shows the same "Announcement from Ana · …" line in two more places: in full on the resbite page of an invitee who hasn't answered (`event.tsx:380-381`, H37 D3), and on the tile of a started resbite still unanswered (`plans.tsx:400-405`, H37 Q5). Should both offer Report and Block too? The default is the card only, as written.

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
- **Shared interfaces** are the rulings' table (`.superpowers/sdd/challenges/chat-rulings.md`), verbatim. Where plan 1's or plan 2's text differs, the table wins. Where chat core's built code differs from either, the built code wins (Revised 12 November).
- **Bodies copied from chat core** are copied as built at sha256 `1047fb37…ce`, and the rollback restores exactly those. Bodies copied from plan 2 are copied as plan 2 built them. Only the private bodies change: chat core's public calls are invoker wrappers over them (e.g. `chat_core.sql:276-280`, :295-300).
- **User-facing copy** writes the apostrophe as ’ (U+2019), as chat core's does (`chatCopy.ts`, H37 Q7). The server's error messages keep theirs as written.
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
5. **A first message from someone who never agreed to the chat rules.** Expected: the sheet comes first, and the server refuses without an acceptance. A blocked term is refused with "That message can’t be sent." Tests in Tasks 2 and 5.
6. **Two blocks between the same people (A blocks B, B blocks A).** Expected: each hides the other's messages, and either unblocking leaves the other block standing. Test in Task 1.
7. **The support address unset, then set, in a build.** Expected: unset, Data & privacy shows no contact line and no empty placeholder, and the runbook blocks submission. Set, the address shows as selectable text with Copy and a mail link. Test in Task 6.

---

### Task 1: Migration section 1: blocks and the block rule everywhere

**Files:**
- Create: `supabase/migrations/20261111160000_chat_safety.sql` (section 1), `supabase/tests/chat-safety.sql` (slice 1; add it to `supabase/tests/hosted-baseline/tests.txt`, after `chat-groups.sql`), `supabase/tests/hosted-baseline/20261111160000_chat_safety.after.sql` (first assertions)

**Interfaces:**
- Consumes, as chat core built them at sha256 `1047fb37…ce`:
  - `private.chat_messages(p_series, p_before, p_limit)` (`chat_core.sql:284-293`; `p_limit` clamped to 1..100, 50 when null);
  - `private.chat_messages_since(p_series, p_after, p_changed_after)` (:304-317; up to 200 rows; a null cursor tests ids only);
  - `private.my_chat_overview()` (:334-364);
  - `private.notification_recipient_eligible(p_outbox)` (:652-692, three branches: the plan kinds, the connection kinds, the chat kinds);
  - `private.send_message(p_series, p_body, p_client_id)` (:464-504);
  - `private.chat_member` (:132-138, as plan 2 redefines it), `private.chat_members` (:143-150) and `private.announcement_audience(p_series, p_audience) returns setof uuid` (:184-193);
  - `private.chat_row` (:209-215) and `private.chat_names` (:222-235), which every read uses for its rows and its `names`;
  - `private.chat_first_name(p_user)` (:201-203).

  Plan 2's `private.chat_summary` and `private.request_connection` bodies, as plan 2 built them. `private.plan_connection_states` (latest, `20261110120000_connections.sql:278`); `private.invite_contacts` (latest, the circles migration `20261111130000_circles_of_trust.sql:301`); `private.can_read_profile` (`20261110120000_connections.sql:304`); the connection functions' pair lock, `hashtextextended(a||':'||b, 53)`. Chat core redefined none of these last four.
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
  - `public.my_blocks() returns jsonb`, with `private.my_blocks`: `[{user_id, name}]` for the people the caller blocked, newest first. `name` is `private.chat_first_name(user_id)` (`chat_core.sql:201-203`), the helper behind the shared `names` map: the first word of `display_name`, or null for a deleted, deleting or folded profile (G-S10). Granted to `authenticated` only.
  - Chat reads redefined, each copied from the built private body (`private.chat_messages` :284-293, `private.chat_messages_since` :304-317, `private.my_chat_overview` :334-364). The public invoker wrappers stay as built (:295-300 with `chat_messages`' defaults, :319-324, :366-370). The reads skip `kind in ('message','announcement')` rows whose author the caller blocked. System lines are never skipped. The `names` map covers the rows returned, as `chat_names(v_rows)` already does.
    - **The skip goes inside the inner `select … order by … limit`** (:289-291 and :312-315), not after it. A page then still holds up to `p_limit` rows the caller may see, and a `since` answer up to 200. The app reads a newest page shorter than 50 as "nothing earlier to load" (`chatSession.ts:329`), and a full answer of 200 as a gap that replaces the list (`chatModel.ts:9`, H22).
  - `my_chat_overview()` also (G-B3), where the built body reads the chat's own figures:
    - `last` is the built `chats.last_message_id` row (:345). It becomes the newest row the caller may see, leaving out a `system` row whose state is `deleted` (plan 2's Decision 6), so it falls back to the previous visible row (confirmation 2, SHOULD 4);
    - `unread` is the built test (`state = 'sent'`, after the caller's read, not theirs and not a line about something they did; :338-339), applied only to rows the caller may see;
    - `count` is `chats.message_count` as built (:343). It becomes the `state='sent'` messages and announcements the caller may see (K-N12, confirmation NOTE 6);
    - `announcements` keeps the built rule: for the caller's unanswered row on a series' current occurrence, while it is active and hasn't ended, the latest sent announcement whose audience includes the caller (H22, H23; :351-362). That is not only `everyone` ones: on a group a pending member is in both audiences. The rule gains "whose author the caller has not blocked". Its `id` stays (S7).
  - `private.chat_summary` redefined, copied from **plan 2's** body (chat core's :248-274 with plan 2's `stopped`) (G-B3); `public.chat_summary` stays:
    - `pinned` is the built `chats.pinned_message_id` row (:254), the latest sent announcement (K-S12). It is null when the caller blocked its author;
    - `last` (the built `chats.last_message_id` row, :255) is the newest row the caller may see, leaving out a `system` row whose state is `deleted`, as in `my_chat_overview`. `names` covers only what is returned (`chat_names` of `pinned` and `last`, :267);
    - `unread` as in `my_chat_overview` (built :271-272), and `message_count` (built `chats.message_count`, :273) counts the `state='sent'` messages and announcements the caller may see;
    - `going` and `everyone` ignore every block, so the blocked person's counts never move (G-B1). They are built on `announcement_audience` (:265-266), which this plan doesn't touch;
    - Task 2 adds `rules_accepted`.
  - `private.notification_recipient_eligible` redefined, copied from the built body (:652-692; it is `create or replace` there). Not eligible when the recipient blocked the actor of a `chat_message` or `announcement` (in the third, chat branch, the message's author `msg.author_id`, :679-691), or of an `invited` notice (in the first branch, :654-668) (G-S13).
  - `private.request_connection` redefined, copied from **plan 2's** body. Its checks, in order (G-B2):
    1. `22023 'That is you'`;
    2. the two visibility refusals as today, `42501 'Names required'` and `42501 'Not on this resbite'`, which never depend on the pair;
    3. a block by the caller of `p_user` → `22023 'Unblock first'`;
    4. a block by `p_user` of the caller → insert `connection_refusals(series_id = the plan's series, from_user = caller, to_user = p_user, hidden = false) on conflict (series_id, from_user, to_user) do update set hidden = false`, queue nothing, and return `'requested'` (G-B1);
    5. then the pair row and every accept path, unchanged.

    A blocked person who asks where they may not ask gets the same 42501 as anyone, because the block checks come after the visibility refusals.
  - `private.plan_connection_states` redefined: `none` for people the caller blocked. `my_connections` is not redefined: no pair row survives a block, so it shows none already (CH-R-A5, confirmation B2).
  - `private.send_message` redefined, copied from the built body (:464-504). Its `chat_message` fan-out (:494-501, `from private.chat_members(p_series) as r(id) where r.id <> v_uid and not exists (…60 seconds…)`) leaves out every recipient who blocked the author: `and not exists (select 1 from private.blocks b where b.blocker_id = r.id and b.blocked_id = v_uid)` (confirmation S2). The coalescing lock (the chat's advisory lock, :484) and rule stay as built. The 60-second test looks only at queued rows, so a blocked author never takes a blocker's one row a minute. The eligibility check stays as the second guard. Task 2 adds its two checks to this same body.
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
- Consumes, as built at sha256 `1047fb37…ce`:
  - section 1;
  - `private.send_message` (`chat_core.sql:464-504`) and `private.send_announcement` (:513-555). Their order of checks is :444-463: the client-id repeat, membership (or host), open, the words (and audience), the author's lock and the limits, the chat's lock, the insert, the notices;
  - `private.chat_body(p_body)` (:433-441), the trim and the visible-character rule, null over 16,000 bytes;
  - the guarded `private.request_account_deletion` (:814-877: a `do` block that runs `create or replace` through `execute` only when `to_regprocedure` finds it, with `set_config('resbite.system','deletion',true)` at :837);
  - the outbox kind check with chat core's 13 kinds (:379-382);
  - the worker's claim (:705-773), which expands (:712) and picks (:743) every kind but the two chat kinds first.
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
  - `private.chat_summary`, section 1's body, gains `rules_accepted` (bool: the caller accepted the current version). The app reads it as `rulesAccepted`.
  - Section 1's `send_message` body gains two checks, and `private.send_announcement` is redefined, copied from the built body (:513-555), with the same two:
    - right after the built `chat_open` check (`send_message` :474, `send_announcement` :524): no acceptance of the current version → `22023 'Rules not accepted'`;
    - right after `private.chat_body` returns a body (`send_message` :475-476, `send_announcement` :525-528): `v_body`, the body as plan 1 trimmed it (chat_body's trim, the one that also strips U+00A0 and the other blanks), matches a blocked term, `v_body ~* ('\m' || term || '\M')`, → `22023 'Not allowed'`. One trim rule, plan 1's, serves both checks (confirmation 2, NOTE 6). `chat_body` refuses over 16,000 bytes before any pattern (H42), so no term is ever matched against a huge body.
    - A repeated `client_id` still returns the existing row first, as plan 1 orders it (step 1, :468-472 and :517-521), so a resend after the rules changed gets its stored row.
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
  - Both report functions queue `report_filed` to every moderator but the reporter: `plan_id` the report's, `actor_id` null, no `message_id`, `dedupe_key 'report:'||id||':'||moderator` (G-B4(c)).
    - `plan_id` is required: the claim joins `public.plans` on it (`chat_core.sql:767`), and the sender refuses a job whose `plan_id` isn't a uuid (`notification-engine.ts:86-95`).
    - With no `message_id`, the claim's chat fields (`series_id`, `message_body`, `audience`, :761-763) are null for it.
    - It is not a chat kind, so the claim expands and picks it before any chat job (:712, :743): a report never waits behind a lively chat.
  - `notification_outbox_kind_check` re-added with chat core's 13 kinds (:381-382) plus `report_filed`.
  - `notification_recipient_eligible`, section 1's body, gains a fourth branch for `report_filed`: the recipient is in `private.moderators` now, `user_eligible`, not being deleted, and the row is under 24 hours old. No membership test and no mute apply. The first branch excludes the kind: it joins the list `o.kind not in ('connection_request','connection_accepted','chat_message','announcement')` (:657).
  - The deletion function (`private.request_account_deletion`), copied from the built body inside its `do`/`execute` guard (:814-877), with its `set_config('resbite.system','deletion',true)` (:837) kept. It also deletes the person's blocks both ways, the reports they filed (G-S11), their `chat_rules_acceptances` rows and their `moderators` row, next to the built `delete from public.connections …` and `delete from private.connection_refusals …` (:853-854). Reports about them stay, with their frozen text. The freeze matters: once an author is gone, `messages_touch` empties their messages whatever way the profile went (:56-72, H42). The built body already deletes the person's own outbox rows (:872), so a moderator's queued `report_filed` goes with them. The local-only `private.activate_deletion_intent` is left to the roadmap's account-deletion item, as chat core left it (its runbook's Known gaps).
  - Ops scripts, plain SQL for the SQL editor (G-S12):
    - `open-reports.sql`, read-only: the open reports, oldest first, with exactly these columns in this order: `id, created_at, reason, details, frozen_body, reporter_name, target_name, resbite_title, resbite_date` (G-S14). No phone number or email.
    - `close-report.sql`: one `values` row at the top, `(report_id, status, action, note)`. It sets `status`, `action`, `review_note` and `reviewed_at = now()` in one transaction, and prints the updated row.
    - `remove-reported-message.sql`: one literal at the top, the report id. It sets the reported message's `state = 'removed'`, `body = null` and `payload = jsonb_build_object('by','resbite')` while it is a `message` or `announcement` still `sent` (the rows `remove_message` takes, :588-601), and prints the message id and state (CH-R-A3).
      - Chat core's triggers do the rest: `messages_touch` moves `updated_at`, so open screens get it through `chat_messages_since`; `messages_chat_stats` lowers the count and re-pins when it was the pinned announcement; `messages_signal` broadcasts it (:56-72, :389-418, :1093-1111). The push eligibility already drops a message no longer `sent` (:685).
      - `by` is not a person key (`chat_names` reads only `actor`, `user` and `brought_by`, :222-235), and `'resbite'` is not a uuid, so it is never looked up.
      - The report stays open until `close-report.sql` records the action (G-B4(b)).
    - `suspend-account.sql`: one literal at the top, the report id. For the report's target it sets their `private.tester_roster` row's `enabled = false` and revokes their live grant in `private.beta_access`. It prints the two counts. The runbook adds the Auth dashboard ban as an owner step.
    - `moderators.sql`: one list of emails at the top. It replaces `private.moderators` with the accounts holding those emails, and prints the count and each email with no account.
    - `blocked-terms.sql`: one list of terms at the top, empty in the repository. It replaces `private.blocked_terms` with the list (lowercased, trimmed, without duplicates) and prints the count, never the terms. The owner pastes the list into the SQL editor's copy only.
  - Rollback, `supabase/rollback/20261111160000_chat_safety.rollback.sql`, in this order:
    - delete the `report_filed` outbox rows;
    - restore chat core's kind check (its 13 kinds, :380-382), `notification_recipient_eligible` (:652-692), `private.chat_messages` (:284-293), `private.chat_messages_since` (:304-317), `private.my_chat_overview` (:334-364), `private.send_message` (:464-504), `private.send_announcement` (:513-555) and the deletion body (:817-874, inside the same `to_regprocedure` guard, where it exists), each byte for byte as built at sha256 `1047fb37…ce`, written `create or replace` so their grants stay;
    - restore plan 2's `private.chat_summary` and `private.request_connection` as plan 2 built them, the connections migration's `plan_connection_states`, and the circles migration's `invite_contacts`;
    - drop `block_user`, `my_blocks`, `report_message`, `report_user` and `accept_chat_rules` in both schemas, and `chat_rules_version`;
    - drop `blocks`, `reports`, `moderators`, `chat_rules_acceptances` and `blocked_terms`. Dropping `private.blocks` is what lets plan 2's rollback run next: its guard refuses while that table exists.

    Its header says what is lost: every block, report, moderator, acceptance and blocked term. It also says to roll back in reverse order only, this plan first, then plan 2's, then plan 1's (G-N11). The full order and guarded chain are chat core's: chat 3 → chat 2 → chat 1 → circles → follow-ups, then connections and creating-a-resbite, which have no guard (`supabase/rollback/20261111140000_chat_core.rollback.sql:34-42`). A message the team removed keeps `payload {by: 'resbite'}`, and a build without plan 3 words it as "Message removed by an admin".

- [ ] **Step 1: Failing SQL test, slice 2.** Each ops script is read as text through `:resbite_repo` (a backtick `cat`, as `20261030130000_phone_key.after.sql:91` and `chat.sql:2255-2259` do), with its top literal swapped by `sed`, and run as postgres.
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
  - In `chat.sql`, each of its transactions writes in its own setup: slices 1 and 2 share the c1 cast (`pg_temp.c1_cast()`), slice 3 has the c1 cast again with c3 people, the way-back block has c6 and the deletion block c5 (`chat.sql:7-9`). The way-back block only runs chat core's rollback to see it refuse once plan 2 is applied (plan 2's Task 2).
  - `chat-send-concurrency.sh`'s writers have the prefix `e9` (`supabase/tests/local/chat-send-concurrency.sh:30-45`).
  - Chat core's and plan 2's hosted-baseline `after.sql` files run before this migration in that mode, so they need none.
- [ ] **Step 4: Rehearsal files.** `before.sql` asserts none of the five tables exists. `after.sql` asserts:
  - the five tables exist with RLS on, no policies and no grants;
  - `blocked_terms` and `moderators` are empty (the migration seeds nothing);
  - `block_user`, `my_blocks`, `report_message`, `report_user` and `accept_chat_rules` are executable by `authenticated` only;
  - the kind check admits `report_filed`;
  - inside a transaction that ends in `rollback`, as `20261110120000_connections.after.sql` does, the rollback restores each previous body exactly (`pg_get_functiondef`), leaves none of the five tables, and leaves no `report_filed` outbox row. Chat core wrote most of its bodies with `create function`, so the comparison runs chat core's statement as `create or replace` and checks nothing changed. It cuts the statement from the file as `pg_temp.ch_source` does (`chat.sql:131-138`); `notification_recipient_eligible` and the deletion body are `create or replace` there already. Plan 2's bodies are compared with plan 2's file;
  - with the rollback run, plan 2's rollback passes its guard (no `private.blocks`).
- [ ] **Step 5: Run** both modes → PASS. The hosted-baseline mode names all five candidates, in order: follow-ups, circles, chat core, chat groups and this migration (`qa/chat-release/README.md:110-113`). Record `sha256sum` of the migration and the rollback.
- [ ] **Step 6: Commit:** `"Safety: reports, moderators, chat rules and blocked terms, and the team's scripts"`

### Task 3: The sender: the moderators' push

**Files:**
- Modify: `supabase/functions/_shared/notification-copy.ts` (`notificationCopy`), `notification-copy.test.ts`, `notification-engine.ts` (`dataFor`, inside `payloadFor`), `notification-engine.test.ts`; `mobile/src/services/pushRegistration.ts` (`PUSH_TYPES`) and `pushRegistration.test.ts`, `mobile/src/services/pushDevice.test.ts` (sign-out's dismissal), `mobile/src/services/pushTaps.test.ts` (`isPlanUpdateTap`, a guard test only) and plan 1's `mobile/src/domain/reminders.ts` (`showsInForeground`) with its test

**Interfaces:**
- Consumes: Task 2's `report_filed` outbox rows, claimed as every other kind is, and before the chat kinds (`chat_core.sql:712`, :743). The claim gives them `title`, `actor_name` null and no chat fields (:750-763).
- Produces:
  - `notificationCopy({ kind: "report_filed", … })` (`notification-copy.ts:167-203`) → `{ title: "Resbite", body: "A new report is waiting." }`, whatever else the row carries. No resbite title, name or text of the report. Today an unknown kind falls through to `GENERIC_COPY` ("Resbite" / "You have an update. Open Resbite to see it.", :22-25 and :201-202), so the new branch goes before that fall-through.
  - `dataFor` (`notification-engine.ts:68-85`, which `payloadFor` wraps, :86-102) for `report_filed`: `data = { type: "report", notificationId }`, with no `planId`. Today any kind that isn't a chat or connection kind gets `type: "plan_update"` with its `planId`. `payloadFor`'s checks still apply (:87-95): the job's `plan_id` must be a uuid and its outbox id digits, which Task 2's rows meet. The `ttl` is the same 3600 as the others (:100).
  - The app:
    - `parseNotificationTarget({ type: "report", notificationId })` (`pushRegistration.ts:169-192`) already returns null, since there is no `planId`;
    - `isPlanUpdateTap` (`pushTaps.ts:13-18`) already lists only `plan_update`, `connection` and `chat`, so it is false for it;
    - a tap opens the app where it was and routes nowhere.
  - `PUSH_TYPES` (`pushRegistration.ts:167`), "every `data.type` Resbite's sender sets (notification-engine.ts `dataFor`)", gains `"report"`. Sign-out's `dismissShownPushes` (`pushDevice.ts:349-358`) dismisses exactly those types (H39), so a moderator's push leaves Notification Center with the account. `parseNotificationTarget` still returns null for a report, since it fails the `planId` test.
  - Plan 1's `showsInForeground(identifier, data, focusedSeries)` (`mobile/src/domain/reminders.ts:73-83`) returns false for any type but reminders, `plan_update` and `chat` today. It gains `type === "report"` → true, so a moderator with the app open still sees "A new report is waiting." (confirmation NOTE 7).

- [ ] **Step 1: Failing tests:**
  - `notificationCopy` for `report_filed`, with a title and an actor name present, gives exactly `{ title: "Resbite", body: "A new report is waiting." }`;
  - `payloadFor` for `report_filed` gives `data` with exactly the keys `type` ("report") and `notificationId`;
  - `parseNotificationTarget({ type: "report", notificationId: "7" })` → null, and `isPlanUpdateTap` on a response carrying it → false (both pass today; they guard the change to `PUSH_TYPES`);
  - `dismissShownPushes` with a shown `{ type: "report", notificationId: "7" }` push dismisses it, beside the built cases (a chat push and a connection push dismissed, a reminder left alone);
  - `showsInForeground("remote-1", { type: "report", notificationId: "7" }, null)` → true, and with a chat focused → true.
- [ ] **Step 2: Run** the edge loader command (`node --import ./mobile/node_modules/tsx/dist/loader.mjs --test …`, `qa/chat-release/README.md:128-132`) on both edge files and `node --import tsx` on the app tests → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all `_shared/*.test.ts` and `npm run check` → PASS.
- [ ] **Step 5: Commit:** `"Safety: the moderators' push says only that a report is waiting"`

### Task 4: The app's safety model: words, gateway, people actions, the reload

**Files:**
- Create: `mobile/src/domain/safetyCopy.ts` and test, `mobile/src/services/safety.ts` and test
- Modify: `mobile/src/domain/eventPage.ts` and test (`PersonAction`, `PersonRow.blocked`, `peopleGroups`), plan 1's `mobile/src/domain/chatCopy.ts` and `chatRules.ts` with their tests (`removedByResbite` in `words`, hence `messageLabel` and `rowText`; `cleanName` exported for Blocked people), plan 1's `mobile/src/state/chatFeed.ts` and test (`wordsOf` for the bubble and the card; `MessageAction` and `messageActions` gain `report`), `mobile/src/services/chat.ts` and test (`ChatSummary.rulesAccepted`, `chatErrorMessage`, `needsChatRules`), `mobile/package.json` (`test` chain)

**Interfaces:**
- Consumes, as chat core built them:
  - `CHAT_COPY` (`chatCopy.ts:4-85`; `removed` :30, `cancel` :20, `keep` :35);
  - in `chatRules.ts`: `words(m)` (:242-247, behind `rowText` :253-263 and `messageLabel` :423-447) and `cleanName` (:126, private);
  - in `chatFeed.ts`: `wordsOf` and `goneOf` (:106-107), `messageActions(m, viewerId, host)` (:100-104) and `MessageAction` (:11, whose comment says "Plan 3 appends Report");
  - `ChatSummary` with its mapper `summary()` (`chat.ts:33-67`, :164-194), the refusal helpers (:250-261, `isTooFast` the pattern) and `chatErrorMessage` (:264-278, falling back to `INVITE_COPY.offline`);
  - `ChatOverview.announcements[planId] = { id, authorId, body }` (`chat.ts:69-75`);
  - `chat.replace()` (`useChat.ts:35-36` over `chatSession.ts:836-842`: it re-reads the summary and the newest page and replaces the list, earlier pages and all; H25 Q3, built for this plan).
- Produces:
  - `SAFETY_COPY` (exact). The apostrophe is ’ (U+2019), as in chat core's copy (`chatCopy.ts:42`, :47, :50; H37 Q7):
    - the report sheet: `report: "Report"`, `reportMessage: "Report message"`, `reportPerson: (name) => \`Report ${name}\``, `reportOrBlock: "Report or block"`, `why: "What’s wrong?"`, `reasons: { harassment: "Harassment", spam: "Spam", inappropriate: "Not appropriate", other: "Something else" }`, `detailsLabel: "Anything else? (optional)"`, `sendReport: "Send report"`, `pickReason: "Pick a reason to send the report."`, `thanks: "Thanks. The Resbite team will look at it."`;
    - block and unblock: `block: (name) => \`Block ${name}\``, `unblock: (name) => \`Unblock ${name}\``, `blocked: "Blocked"`, and `blockQuestion(name, youHost, theyHost)` (G-N9, the person's name, never a pronoun):
      - `youHost` true: \`Block ${name}? You won’t see ${name}’s messages or announcements, and you won’t be able to remove ${name}’s messages.\`;
      - `theyHost` true only: \`Block ${name}? You won’t see ${name}’s messages or announcements, and ${name} won’t know.\`;
      - neither: \`Block ${name}? You won’t see ${name}’s messages, and ${name} won’t know.\`;
    - errors: `unavailable: "You can’t report that any more."`, `unblockFirst: "Unblock this person first."`, `notAllowed: "That message can’t be sent."` (G-B4(a));
    - the chat rules (G-B4(d)): `rulesTitle: "Chat rules"`, `rules: "Be kind. No harassment, hate, threats or spam. Messages that break these rules are removed, and people who break them can lose their account."`, `agree: "I agree"`;
    - blocked people (G-S10): `blockedPeople: "Blocked people"`, `noneBlocked: "You haven’t blocked anyone."`;
    - contact (G-N10): `contact: (address) => \`Questions, or something wrong in a chat? Write to ${address}.\``, `copyAddress: "Copy address"`, `copied: "Copied"`;
    - reports on Data & privacy (G-S11): `reportsPrivacy: "If someone reports a message, the Resbite team reads it, and keeps a copy with the report even if the message or account is deleted."`.
  - `supportAddress(env: string | undefined): string | null`: trimmed, null when empty.
  - `thanksLines(address: string | null): string[]`: `[thanks]`, or `[thanks, contact(address)]` when set (G-N10).
  - `showsReportOrBlock(otherPeople: number): boolean`: false at 0 (G-N7).
  - `ReportTarget = { kind: "message"; id: number } | { kind: "user"; userId: string; series: string; name: string }` (G-N6).
  - `createSafetyGateway(rpc, deadline?)` → `{ block(userId), unblock(userId), myBlocks(), reportMessage(id, reason, details?), reportUser(userId, series, reason, details?), acceptRules() }`. It is in the shape of `createChatGateway(rpc, deadline = passThrough)` (`chat.ts:218-248`): `Rpc`, `Deadline` and `passThrough` from `./contactInvites`, `planDeadline` for the live one, the client loaded on first use, and a refusal thrown as the server sent it:
    - `block_user` with `{p_user, p_block: true}`, and `{p_user, p_block: false}` for unblock;
    - `my_blocks` mapped to `{ userId, name }[]`;
    - `report_message` with `{p_id, p_reason, p_details}`, `p_details` null when absent;
    - `report_user` with `{p_user, p_series, p_reason, p_details}`;
    - `accept_chat_rules` with `{}`.
  - `safetyErrorMessage(e)`: `'Report unavailable'` → `unavailable`, `'Unblock first'` → `unblockFirst`, else `INVITE_COPY.offline` (G-N6), as `chatErrorMessage` falls back (`chat.ts:277`).
  - `ChatSummary` gains `rulesAccepted: boolean`, read by `summary()` as `data.rules_accepted === true`, as the built mapper reads every flag (`chat.ts:176-191`). `chatErrorMessage`'s 22023 branch (:272-276) maps `'Not allowed'` → `SAFETY_COPY.notAllowed`. `needsChatRules(e)` is true for `22023 'Rules not accepted'`, written like `isTooFast` (:261) with the built `refusal` helper (:250-251).
  - Blocked people's names (Task 6) are cleaned by `cleanName` (`chatRules.ts:126`, exported for it), the cleaning every name in a chat gets (`nameOf`, :129-130), with "Someone" for null. Chat core's note asks this plan to choose between `oneLine` and `cleanText` for a name or a preview. `oneLine` (:121-124) keeps zero-width and directional marks that `cleanText` (:110-113) removes. A name reads as the chat reads it, and this plan shows no report preview.
  - `PersonAction` gains `report`, `block` and `unblock`. `PersonRow` gains `blocked: boolean`. `peopleGroups(i)` takes `blocks: ReadonlySet<string>`:
    - every row with a `userId` other than the viewer's gets `report`, then `block`, or `unblock` when the person is in `blocks`;
    - `request` rows get `block` or `unblock` only, never `report` (G-S9);
    - a blocked person's row has no connection actions and `blocked: true`, which shows the badge to the blocker only.
  - No `afterBlockChange`: chat core built the reload as `chat.replace()` (G-S8), already tested in `chatSession.test.ts` (around :1597). After a block or unblock the screen calls it (Task 5), and the cached list goes, older pages included.
  - `MessageAction` (`chatFeed.ts:11`) gains `"report"`. `messageActions` (:100-104) offers it, after Delete or Remove, on someone else's `message` or `announcement` in state `sent`, whether or not the reader hosts. Rows with no author and system lines get none (G-N12).
  - `CHAT_COPY.removedByResbite: "Message removed by Resbite"` (CH-R-A3). A row with `state = 'removed'` and `payload.by = 'resbite'` uses it. Chat core words a removed row in two places, so both change:
    - `words(m)` (`chatRules.ts:242-247`), for `messageLabel` and `rowText`;
    - `wordsOf(m)` (`chatFeed.ts:107`), for the bubble and the announcement card.

    Every other removed row keeps plan 1's `removed`, "Message removed by an admin".

- [ ] **Step 1: Failing tests:**
  - every string, exactly, with the three block questions for "Ana";
  - each gateway call and its arguments;
  - `safetyErrorMessage` for both errors and its fallback; `chatErrorMessage` for `'Not allowed'`; `needsChatRules`;
  - `supportAddress(undefined)` and `supportAddress("  ")` give null; `supportAddress(" help@x.example ")` gives `"help@x.example"`;
  - `thanksLines(null)` gives one line; `thanksLines("help@x.example")` gives the thanks and "Questions, or something wrong in a chat? Write to help@x.example.";
  - `showsReportOrBlock(0)` false, `showsReportOrBlock(1)` true;
  - `peopleGroups`: every other row gets `report` and `block`; `unblock` instead of `block` for a person in `blocks`; a `request` row gets `block` and no `report`; a blocked row has no `connect` and `blocked: true`; the viewer's own row has none of them;
  - `messageActions`: someone else's sent message gives `["report"]` to a guest and `["remove", "report"]` to a host; one's own gives `["delete"]`; a removed or deleted row and a system line give `[]`;
  - `CHAT_COPY.removedByResbite` exactly. `rowText`, `messageLabel` and `chatFeed`'s bubble text of a removed row with `payload {by: "resbite"}` say "Message removed by Resbite", and of a host's removal (no payload) "Message removed by an admin";
  - `cleanName` of a name holding a zero-width space and a right-to-left mark reads without them.
- [ ] **Step 2: Run** each with `node --import tsx` → FAIL.
- [ ] **Step 3: Implement,** and append the new tests to `package.json`.
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5: Commit:** `"Safety: the app's words, gateway and people actions for report and block"`

### Task 5: Report, block and the chat rules on screen

**Files:**
- Create: `mobile/src/design/ReportSheet.tsx`, `mobile/src/design/ChatRulesSheet.tsx`
- Modify: `mobile/app/chat.tsx` (long-press "Report message"; a tap on an author's name opens their sheet; the menu's "Report or block"; the rules sheet before a first send; `chat.replace()` after a block or unblock), `mobile/src/state/chatSession.ts` and test (a rules refusal said to the screen; the summary's `rulesAccepted` after I agree), `mobile/src/state/useChat.ts` (exposes what the session adds; `replace` is already there), `mobile/app/guests.tsx` (Report, Block and Unblock in the person's sheet; `ACTION_ICON`; a `"report"` sheet view), `mobile/src/state/useEvent.ts` (reads `my_blocks` beside the connection states), `mobile/scripts/verify-chat.mjs` (the shared summary fixture, `verify-chat.mjs:228-249`, gains `rules_accepted: true`), `mobile/scripts/verify-event.mjs`, `mobile/app/(tabs)/plans.tsx` and `mobile/src/design/kit.tsx` (`CoverCard` gains `onLongPress?` and its `accessibilityActions`), `mobile/scripts/review-ui.mjs`

**Interfaces:**
- Consumes: Task 4; `useEvent` for the current occurrence's people (G-N6); plan 1's `my_chat_overview` entries with their `id` (confirmation S7), read on My resbites by `chatGateway.overview()` (`plans.tsx:102-109`) and shown through `pendingCardNote` (`chatRules.ts:292-301`) on the invitation cards (`plans.tsx:303-320`); the chat screen as chat core built it: the menu sheet (`chat.tsx:615-640`), the long-press action sheet (:644-697, `ACTION_LABEL` :70, every action drawn red with `Trash2` today), its focus cleanup (:161-170), and `chat.replace()` and `chat.retry(clientId)` (`useChat.ts`).
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
  - **Long-press** offers Report message only on someone else's `message` or `announcement` in state `sent` (G-N12): the `"report"` action from `messageActions` (Task 4), also an `accessibilityActions` entry through the built `actionsOf` (`chat.tsx:772-774`). In the action sheet it is not red and has no bin icon, and it opens the `ReportSheet` rather than the in-place delete or remove question.
  - **A removed row** reads "Message removed by Resbite" when its payload says so (CH-R-A3, Task 4).
  - **The invitation card's announcement line** (confirmation S7). On My resbites, a long-press on a pending invitee's card that shows an announcement offers "Report message" (`ReportSheet` with `{kind: "message", id: <overview entry id>}`) and "Block <name>" (the confirm `blockQuestion(name, false, true)`, the name from the overview's `names` as the card words it). The same two are `accessibilityActions` on the card. After a block the overview is read again, and the line goes. Chat core also shows that line on the resbite page and on a started, unanswered tile (open question Q1).
  - **The block confirm** reads `blockQuestion(name, youHost, theyHost)`. After a block from an author's name, focus moves to the sheet's result line, `blocked` (G-N7).
  - **After a successful block or unblock,** the chat screen calls `chat.replace()`, which chat core built for this (H25 Q3). It reads the summary and the newest page with `chat_messages`, and replaces the list, earlier pages and all (G-S8). A block keeps the chat on screen, so `focusedChat` stays right. Any path that hides the chat without leaving its screen clears it with `setFocusedChat(null)`; leaving the screen already does (`chat.tsx:161-170`, H36).
  - **Sending before the rules are accepted** (G-B4(d)):
    - with `summary.rulesAccepted` false, Send and Send announcement open the rules sheet first and call nothing. I agree calls `acceptRules()`, then `chat.send(body)` (or `chat.announce(body, audience)`), whose client id the session makes. Cancel leaves the words in the field;
    - a send the server refuses with `needsChatRules`: the session marks the queued message failed, as it does every refusal, to be sent again only by a tap with its own client id (`chatSession.ts:703-713`). The screen sees only `chat.error`, so the session must say that it was the rules: on `needsChatRules` it re-reads the summary, as it does after 'Hosts only' (:389-392), and `summary.rulesAccepted` false then opens the sheet. I agree calls `acceptRules()`, then `chat.retry(clientId)`, the same client id. An announcement keeps its client id for the same text and audience (:922-924), so `chat.announce` with the same words sends the same one. Cancel leaves the item "Not sent. Tap to retry.", its built failed state. A failed message is never resent by itself, whatever its age (H41 I2b), so nothing goes out before I agree;
    - after `acceptRules()` the summary must say so before the next Send, either by a summary re-read or by setting it in the session as `setMute` sets `mutedChat` (`chatSession.ts:951`). Otherwise the next Send opens the sheet again.
  - **The person's sheet,** on the people list and in the chat: "Report <name>", then "Block <name>" (red, in-place confirm) or "Unblock <name>". The connection actions hide while blocked. A "Blocked" badge on the row shows to the blocker only.

- [ ] **Step 1: Extend `verify-chat.mjs`.** The labels s1 to s10 keep clear of plans 1 and 2. Plan 1 has an (s) of its own (`verify-chat.mjs:1211`), and plan 2 uses (gr1) to (gr9).
  - (s1) Long-press on Leo's message → Report message. The reasons are radios, and Send report is disabled with the hint `pickReason`. Spam → Send → `report_message` with `{p_id, p_reason: "spam", p_details: null}`, then the thanks line.
  - (s2) The same, answered offline: the sheet stays, the typed details stay, and the error line shows.
  - (s3) Long-press on one's own message, and on a system line: no Report message.
  - (s4) The menu → Report or block → Leo → Block Leo. The confirm reads "Block Leo? You won’t see Leo’s messages, and Leo won’t know." Confirm → `block_user` with `{p_user, p_block: true}`. Then `chat_summary` and `chat_messages`, not `chat_messages_since`, are called (`chat.replace()`), and no bubble by Leo remains (G-S8, G-S14).
  - (s5) As a host blocking a guest, the confirm reads "Block Leo? You won’t see Leo’s messages or announcements, and you won’t be able to remove Leo’s messages."
  - (s6) A tap on an author's name → Block → confirm: focus lands on "Blocked".
  - (s7) With `rules_accepted: false`, Send opens "Chat rules". Cancel sends nothing and keeps the words in the field. I agree calls `accept_chat_rules`, then `send_message` once.
  - (s7b) With `rules_accepted: true` in the summary but `send_message` answered `22023 'Rules not accepted'`: the bubble reads "Not sent. Tap to retry.", the summary is read again (now `rules_accepted: false`), and "Chat rules" opens. I agree calls `accept_chat_rules`, then `send_message` with the same `p_client_id`.
  - (s8) A send answered `22023 'Not allowed'` shows "That message can’t be sent."
  - (s9) Alone in the chat, the menu has no Report or block.
  - (s10) A row with state `removed` and payload `{by: "resbite"}` shows "Message removed by Resbite". A host's removal, with no payload, shows "Message removed by an admin" (CH-R-A3).

  `verify-event.mjs`:
  - the people sheet shows Report and Block;
  - a waiting join request's sheet shows Block and no Report;
  - a blocked person's row shows "Blocked" and no Connect.

  `review-ui.mjs`, on `/plans` (confirmation S7):
  - a pending invitee's card with "Announcement from Ana · Doors open at 19:30": a long-press → Report message → Spam → Send calls `report_message` with the overview entry's `id` as `p_id`;
  - a long-press → Block Ana → the confirm reads "Block Ana? You won’t see Ana’s messages or announcements, and Ana won’t know." Confirm calls `block_user` with `{p_user, p_block: true}`, then `my_chat_overview` again, and the line is gone.
- [ ] **Step 2: Run** with Expo web → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run check`, `verify-chat.mjs`, `verify-event.mjs`, `review-ui.mjs` → PASS.
- [ ] **Step 5: Commit:** `"Safety: report, block and the chat rules from a message, a person, the chat and the invitation card"`

### Task 6: Blocked people, the contact address and Data & privacy

**Files:**
- Create: `mobile/app/blocked-people.tsx` (route `/blocked-people`)
- Modify: `mobile/app/_layout.tsx` (its Stack entry, beside chat core's `<Stack.Screen name="chat" />`), `mobile/app/data-privacy.tsx` (a "Blocked people" row, a "Contact" topic, the reports line in plan 1's "Chat messages" topic, `data-privacy.tsx:90-101`), `mobile/scripts/verify-deletion.mjs` (the script that covers the Privacy screen at `3b5be48`), `mobile/scripts/review-ui.mjs` (chat core's check of the Chat messages topic's exact text, `review-ui.mjs:140-143`, gains the reports line)

**Interfaces:**
- Consumes: Task 4's gateway and copy; `expo-clipboard`, already a dependency (`mobile/package.json:25`); `Linking`, as `mobile/src/design/TickRow.tsx:91` opens the Terms.
- Produces:
  - **Blocked people** (G-S10): a Row on Data & privacy, after the topics, opening `/blocked-people`. The screen lists `my_blocks` by name, cleaned with `cleanName` (Task 4) and "Someone" (`CHAT_COPY.someone`) when null, each with "Unblock <name>", which acts at once. With nobody: `noneBlocked`. A failed read shows the error line with Try again. A failed unblock keeps the row and shows `safetyErrorMessage`.
  - **A "Contact" topic,** shown only when `supportAddress(process.env.EXPO_PUBLIC_SUPPORT_ADDRESS)` is not null (G-N10): the `contact(address)` line with the address as selectable text, a "Copy address" button (`expo-clipboard`, then `copied` announced), and the address as a `mailto:` link opened through `Linking`.
  - **Plan 1's "Chat messages" topic** (`data-privacy.tsx:90-101`, whose text keeps chat core's hedge about account deletion, H38) gains `reportsPrivacy` (G-S11).

- [ ] **Step 1: Failing checks** in `verify-deletion.mjs`, in two runs, since `EXPO_PUBLIC_*` is inlined when the bundle is built (G-S14):
  - Expo started without the variable: no Contact topic and no empty placeholder. The Blocked people row opens the screen. With `my_blocks` answering Leo, "Unblock Leo" calls `block_user` with `{p_user, p_block: false}` and the row goes. With nobody, "You haven’t blocked anyone." The "Chat messages" topic shows `reportsPrivacy`, and `review-ui.mjs`'s check of that topic (`:140-143`) expects chat core's text followed by it.
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
  - **The completed release runbook.** Chat core wrote `qa/chat-release/README.md` in parts, for plans 2 and 3 to extend (README:7), and plan 2 adds its groups part. This plan completes it inside the sections and step numbers chat core built, rather than a new list. Those numbers are cited by the scripts' comments and by the runbook's own cross-references ("step 0's question", "Rollback, step 2"). Owner-run scripts keep chat core's shape: `! bash ~/<name>.sh`, written into the home directory from a block in the step, checking the file's sha256, running from `${REPO:-$HOME/dev/resbite-app}`, and printing no secret, number or account id (README:178-183). Each step with its owner approval:
    - **The header** (README:1-14): the runbook is now whole. "Written in parts … nothing here is run" (README:7) and "Report and block (plan 3) must ship with any chat" become this release's order. The Code line names the three branches.
    - **What is built, Files and hashes, Checks made locally** (README:15-155):
      - a safety section in the same shape;
      - this migration, its rollback, its before/after files and the six ops scripts with their sha256;
      - the hosted-baseline command with all five candidates and its PASS count;
      - the fingerprint replay on from plan 2's count, and the rollback back to it.
    - **Step 0, the owner questions** (README:185-196). Each with "needed before" and its default, as the roadmap's owner table has them:
      - the support address;
      - who moderates (default: the owner);
      - the blocked terms (default: none seeded, and the release waits for a list);
      - the chat rules' wording and the Terms document (default: the rulings' wording, the Terms unchanged);
      - G-S13's default for invitations;
      - plan 2's open questions if still open.
    - **Step 1, before snapshot** (README:197-231): `ch1-before.sh` as built. Nothing of this plan exists before (its `before.sql` asserts the same locally).
    - **Step 2, the migrations** (README:233-272): the owner approves the three files by name and sha256, in the one sitting, and runs `ch1-apply.sh`, plan 2's `ch2-apply.sh`, then `! bash ~/ch3-apply.sh`. `ch3-apply.sh` is in the same shape:
      - the hash check;
      - a guard that refuses unless plan 2 is applied (`private.series_leaves` exists) and this plan isn't (`private.blocks` doesn't exist);
      - one transaction;
      - `supabase migration repair --status applied 20261111160000 --linked --yes`, after which the history reads `24 | 20261111160000`.

      Never `supabase db push`. Any rollback goes in reverse order only: plan 3's, then plan 2's, then plan 1's (G-N11).
    - **Step 3, after snapshot and advisors** (README:274-322):
      - the fingerprint and counts for all three;
      - the advisors compared as chat core's step 3 says. Expected: nothing above INFO. Chat core's four public tables bring their `rls_enabled_no_policy` INFO lines, but plans 2 and 3 add no public table (their tables are all in `private`), so no more of that kind;
      - the three migrations' lines for `supabase/tests/hosted-baseline/migrations.txt`, then the baseline run with no candidate.
    - **Step 4, the sender redeploy** (README:324-350): the one redeploy, after step 2, carries chat core's chat words and the `report_filed` words and data (Task 3). The old finish refuses `deferred` until chat core is live (README:172-174), so it never goes before step 2.
    - **Step 5,** Realtime "Allow public access" off (README:351-354), as built.
    - **Step 5a (new), in the SQL editor** (G-S12): `supabase/ops/moderators.sql` with the moderators' emails, and `supabase/ops/blocked-terms.sql` with the owner's list. **Release gate:** `select count(*) from private.blocked_terms` is above 0, and `private.moderators` has at least one row. Otherwise the release waits.
    - **Step 5b (new):** `EXPO_PUBLIC_SUPPORT_ADDRESS` set in the EAS production environment, checked with `npx eas env:list --environment production`. Submission is blocked until it is set.
    - **Step 6, the TestFlight build** (README:355-360): only after steps 2, 4, 5, 5a and 5b. Submit with the review notes pasted into App Store Connect.
    - **Step 7, device checks** (README:361-418): chat core's as written, plan 2's groups checks, and these:
      - a blocked person's messages, pinned card and unread dot are gone on the blocker's phone;
      - the blocked phone sees "Request sent" after asking;
      - a report reaches the moderator's phone as "A new report is waiting.", its tap opens nothing, and signing out clears it from Notification Center (Task 3);
      - the rules sheet comes before a first message;
      - a blocked term is refused;
      - the report sheet scrolls at the largest text size with the keyboard open.
    - **Step 8,** the throughput check (README:420-436), as built. `report_filed` counts among `other_pending`, never the chat backlog.
    - **Step 9 (new), reading the reports queue, in the SQL editor:**
      - the moderator's push, plus a daily run of `open-reports.sql`;
      - for each report, `remove-reported-message.sql` and `suspend-account.sql` as needed;
      - for a suspension, the Auth dashboard ban (owner);
      - then `close-report.sql`, recording which action was used;
      - target: within 24 hours of the report.
    - **Rollback** (README:442-497): the full order and guarded chain already name this plan ("chat 3, chat 2, chat 1…"). Add this plan's steps with `! bash ~/ch3-rollback.sh`, in `ch1-rollback.sh`'s shape: the hash, one transaction, the fingerprint back to plan 2's count.
      - It goes first: plan 2's rollback refuses while `private.blocks` exists.
      - Say what is lost: every block, report, moderator, acceptance and blocked term.
      - The sender to put back first is the one live before step 4. Chat core's rollback step 2 names its own, by tree id.
      - Remove this migration's line from `migrations.txt`.
    - **Known gaps** (README:499-511): the gaps this plan accepts, for example a team removal read as "Message removed by an admin" on a build without plan 3, and open question Q1 if still open.
  - Decisions log: a "Chat safety (CH), <date>" section after plan 2's, one line each with no nested bullets (H40), holding this plan's Decisions 1 to 13. Chat core's lines that point to plan 3 now point to it: CH-P7 ("Blocks are plan 3's"), CH-P13 and CH-P18 ("Blocks and reports are plan 3's") (`knowledge-base/08-decisions.md:622-672`).

- [ ] **Step 1: Write** the notes and the runbook.
- [ ] **Step 2: Full check:** `bash scripts/test-database-docker.sh`, `(cd mobile && npm run check)`, the edge tests → PASS ×3.
- [ ] **Step 3: Commit:** `"Safety: the review notes and the release runbook"`
