# Report and Block Implementation Plan (chat plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can report a message or a person and block a person. A block hides that person's messages and pushes everywhere and ends any connection, and the blocked person can't tell. A first message waits for the chat rules, and a blocked-terms list stops the worst words. Each report pushes the Resbite team, who have scripts to read, close, remove and suspend. The app shows a contact address. Together these meet App Store guideline 1.2.

**Architecture:** One migration in two sections. Section 1 adds blocks and the block rule in the chat reads, the push eligibility, the connection functions, `invite_contacts` and the contact lookup. Section 2 adds reports, moderators and the `report_filed` notice, the chat-rules acceptance, the blocked-terms filter, the deletion step and the fold. Seven owner-run scripts for the SQL editor read and close reports, remove a reported message, suspend an account, delete closed reports when they are due, and set the moderators and the blocked terms. The sender words the moderators' push. The app gets a report sheet, a block confirm, the chat-rules sheet and a "Blocked people" screen, reachable from a message, a person's sheet, the chat menu, an invitation's card and resbite page, Connections and Data & privacy. A block made anywhere refreshes every open chat. The support address comes from the EAS environment. This plan also completes the release runbook for all three chat plans.

**Tech Stack:** as chat plan 1.

**Spec:** `docs/superpowers/specs/2026-11-10-groups-and-chat-design.md` CH-P13, CH-P18 and the Anti-goals; `docs/superpowers/specs/2026-11-10-connections-and-circles-design.md` CO-P3 (a refusal is invisible) and CO-P14 (a block ends a connection and refuses new ones).

**Branch:** `ch3-safety`, made from `ch2-groups` at `333747d` (chat core plus plan 2's finished database work, Tasks 1 and 2), the way `ch2-groups` was made on `ch1-core` at `43f4416`. Ships in the same release as plans 1 and 2.

**Sequencing with plan 2's Task 4 (the controller orders this).** Tasks 1 to 3 touch no file plan 2's Task 4 changes, and can be built from `333747d` now. Tasks 4 to 7 build on plan 2's app and runbook **as plan 2's Task 4 leaves them** (`93aa1da` on `ch2-groups` when this was written, under review), so they start only after that commit, as accepted, is merged into `ch3-safety`. Plan 2's Task 4 changes these files that this plan also changes: `mobile/app/chat.tsx`, `mobile/app/event.tsx`, `mobile/app/(tabs)/plans.tsx`, `mobile/src/state/useEvent.ts`, `mobile/src/domain/chatRules.ts` and its test, `mobile/scripts/verify-chat.mjs`, `verify-event.mjs`, `verify-connections.mjs`, `review-ui.mjs`, `qa/chat-release/README.md`, `knowledge-base/08-decisions.md` and `docs/implementation-status.md`. Line numbers this plan gives in those files are at `333747d`; after the merge, find each by the name cited beside it.

**Tasks:** 7.

## Revised 12 November 2026 (after plan 2 was built)

Plan 2 (groups) is built on `ch2-groups`: its database work is complete and reviewed at `333747d` (rulings GR1 to GR3 in its ledger), and its app Task 4 is at `93aa1da`, under review. Its migration `supabase/migrations/20261111150000_chat_groups.sql` has sha256 `f7a34398040e04cd5cf412b29c0dd5260fd0f525b432f284f2f642aa18287d28` and its rollback `supabase/rollback/20261111150000_chat_groups.rollback.sql` `eb1c530b63b74351043ca39658112288070c080ac2dcb5499f08a50ef824fb1a`, both checked; "plan2.sql:N" below is a line of that migration. This revision brings the plan in line with plan 2 as built and applies the rulings on `.superpowers/sdd/challenges/chat-3-safety-confirmation.md` (I-1 to I-4 and its NOTEs, in `chat-3-safety-after-core-rulings.md`, binding). Every line number below in a code file is at `333747d` unless it says otherwise. The lists "Revised 12 November (after chat core was built)" and older are kept as the record: their app line numbers are chat core's at `43f4416`, and the tasks now carry the corrected ones.

What changed, one line each:
- **Branch and sequencing:** `ch3-safety` is made from `333747d`. Tasks 1 to 3 can start now; Tasks 4 to 7 wait for plan 2's Task 4, which changes `chat.tsx`, `event.tsx`, `plans.tsx`, `useEvent.ts`, `chatRules.ts`, the verify scripts and the runbook (the Sequencing paragraph above).
- **Bases settled (B2):** each copied body's base is named with its file, sha256 and lines ("Bases" below). The build-time "re-verify, copy from the last file listed" hedge is gone: plan 2 redefines `chat_summary`, `request_connection` and `notification_recipient_eligible` and nothing else this plan copies; the deletion, the fold, the claim, the three reads and the two writes are chat core's. The one check left is that each base file still has its recorded hash.
- **Plan 2's facts this plan now names:** `private.chat_row` returns `plan_id` and hides the place through `private.chat_place_hidden` (plan2.sql:691-717, GR1); the eligibility's group `case` (plan2.sql:677, P2-Q1); `request_connection`'s group exception only for current members (plan2.sql:596-601, GR3 Q2); the roll's `invited` notice with `detail 'again'` (plan2.sql:470-475); `leave_series` (plan2.sql:522-555); the chat.sql way-back switch plan 2 built (chat.sql:2256-2292).
- **I-1:** Task 1 changes `chat.sql:553`, `:565-569` and `:574` for `inviters`, with exact values; Task 2 changes `chat.sql:227-229` for `rules_accepted`. At `333747d`, `:619-620` and `:884-886` (the confirmation's `:614-615` and `:877-879`) are partial checks that the new key doesn't break. The app's typed fixtures and `deepEqual`s the two new fields break are named in Task 4. Every test file runs in both modes.
- **I-2:** `invitationActions` gains the owner the card and the page name ("Ana invited you", "Hosted by Ana"), after the announcer and the inviter, once; the card passes `p.owner_id` with `hosts`, the page the plan's owner with `organizer`. No server change (`block_user` reads the owner through `can_read_profile`, `report_user`'s R-Q1 clause admits the owner). Tests in Tasks 1, 4 and 5. Decision 14, Review Focus 9.
- **I-3:** `public.claim_notification_deliveries` is redefined from chat core's body (`chat_core.sql:705-773`, plan 2 doesn't redefine it) with one clause: `brought_by_name` is null when the recipient blocked the bringer, so no push names someone the recipient blocked (a blocked answerer's `rsvp` is already ineligible by R-Q5). Rollback line, rehearsal comparison and a slice 1 test. Tasks 1 and 2, Decision 18.
- **I-4:** slice 2's reporter and target exclusions are tested with 17 a moderator and every `report_filed` row moved back 11 minutes first, so each "none to 09" can fail; the coalescing test moves every row to 09. Task 2.
- **NOTE 1 (test order and timings):** I1's hand-made rows are dated 2 minutes back (so B2's "04 writes" isn't 'Slow down'); N1's outbox rows move back 61 seconds before S2; every 61-second move is `created_at = now() - interval '61 seconds'`; I7's limit block runs in a savepoint topped up to exactly 20; slice 2's setup rolls the group, so a previous occurrence exists. Tasks 1 and 2.
- **NOTE 2:** `useEvent` hears "blocks changed" and reads `my_blocks`, the connection states and an invitee's overview again; `verify-event.mjs` checks Block → "Blocked", Unblock → Connect, not Connected. Task 5.
- **NOTE 3:** the roll's "<title> is on again" (`invited` with `detail 'again'`, actor the owner, plan2.sql:470-475) names nobody and joins `plan_changed` and `plan_cancelled` as the resbite's own news. Test. Task 1, Decision 18.
- **NOTE 4:** the Global Constraint on the blocked person adds "or a number not on Resbite (Decision 11)".
- **NOTE 5:** `connectionErrorMessage` (`services/connections.ts:91-99`) words `22023 'Unblock first'` with `SAFETY_COPY.unblockFirst`. Task 4.
- **NOTE 6:** `inviters` covers the caller's unanswered rows on a current occurrence that is active and has not ended, whether or not an announcement exists. Task 1.
- **NOTE 7:** `theyHost` is decided in `invitationActions`: true for the announcement's author and the owner, false for an inviter who is neither. Tasks 4 and 5.
- **NOTE 8 (citations):** the author's lock at `chat_core.sql:479` and `:530`; the cut line `plans.tsx:406-407`; `peopleGroups`' `connections` at `eventPage.ts:579` and `connectionOf` at `:596-597`; `GENERIC_COPY` at `notification-copy.ts:23-26`; the `invited` actor at `circles_of_trust.sql:369` and `:418` (and plan2.sql:471 for the roll); the way-back switch is plan 2's own (chat.sql:2256-2292). Every other app citation moved to `333747d`: `chatRules.ts`, `chatFeed.ts`, `chatCopy.ts`, `services/chat.ts`, `eventPage.ts`, `useEvent.ts`, `chat.tsx`, `event.tsx` and `chatSession.test.ts`.
- **NOTE 9:** `safetyErrorMessage` lives in `services/safety.ts`. Task 4.
- **Other corrections found against the code:** `contacts_on_resbite` is `phone_key.sql:92-107`; `plan_connection_states` is `connections.sql:278-294`, `invite_contacts` `circles_of_trust.sql:301-443`, `can_read_profile` `connections.sql:304-310`; the rollback and the rehearsal now cover `plan_connection_states`, `invite_contacts` and the claim; `request_connection`'s refusal for a blocked asker needs `v_series`, which the built body reads only at plan2.sql:602; chat-groups.sql's rules acceptance goes in `pg_temp.e6_cast()` (chat-groups.sql:88-118), which every block runs first; the page's More for a pending one-off invitee relies on the More plan 2's Task 4 puts beside the answer control; the runbook builds on plan 2's (fingerprint from 479, history `24 | 20261111160000`); plan 3's deletion copy keeps plan 2's parked GR2 gap as it is; slice 1's `my_blocks` "deleting" case runs in a savepoint (a real deletion request would stop 04 writing in I1 and B2); slice 1's third plan has 02 as its admin too, I-3's second host; slice 2's 09 is Going on the one-off and joins `private.moderators` only where the lines say; `review-ui.mjs` refuses unplanned requests, so the new calls are stubbed there; the owner stays offered on the card after a block (Known gaps).
- **Self-review re-run** (end of this section).

**Self-review (12 November 2026, after plan 2 was built).**
- Spec coverage: CH-P7 (blocks in pushes, Task 1), CH-P13 (report, block, the address, Tasks 1 to 6), CH-P18 (reports filed go with the account, Task 2), CO-P3 and CO-P14 (Task 1) and the Anti-goals (chat ships with report and block, Task 7's rollback notes) each still have a task. Plan 2's group cases (a pending member in the chat, a leaver, a rolled week, a cancelled week) are in slice 1 (B2) and slice 2 (the leaver, the previous occurrence).
- Step scan: no "re-verify", "TBD" or "if plan 2 redefines" is left; every copied body names its base, hash and lines, and every changed test names its line and expected value.
- Names and types: `invitationActions`' new `owner` input and `theyHost` field are the same in Tasks 4 and 5; `ChatSummary.rulesAccepted` and `ChatOverview.inviters` match the server keys `rules_accepted` and `inviters`; `onBlocksChanged`, `blocksChanged`, `safetyErrorMessage` and `connectionErrorMessage` are each defined once and used as defined; the rollback's restore list equals the redefinition list (fourteen bodies, "Bases").
- Review Focus: I-2 (the owner) and I-3 (a push naming a blocked person) join Review Focus 9 and 1; NOTE 3 joins 3.
- Proportion: this revision adds no function body; it settles names, lines and values.

## Revised 12 November 2026 (after chat core was built)

Chat core (plan 1) is built and reviewed on `ch1-core` at `43f4416`. Its migration `supabase/migrations/20261111140000_chat_core.sql` has sha256 `1047fb379a4e8a942b49db3f7134674caecf2cbb30f67e0ebf9f0f2fea6a78ce`, and every `chat_core.sql:N` below is a line of that file. This revision brings the plan in line with what was built: the notes chat core left (`.superpowers/sdd/challenges/chat-1-notes-for-plans-2-3.md`, binding), its code, and its ledger's rulings (H1–H43). **Where this plan copies a chat core body to extend it, it copies the body as built at that hash, and its rollback restores that exact body.** Plan 2's bodies (`chat_summary`, `request_connection` and, after P2-Q1, `notification_recipient_eligible`) are copied from plan 2's final migration as built, by the rule under "Bases" below. Each correction, old → new with the built file and line, is in `.superpowers/sdd/challenges/chat-2-3-after-core.md`. Where the rulings' Shared interfaces table and the built code differ, the built code wins.

What changed, one line each:
- **Branch:** stacked after plan 2, as plan 2 is on chat core.
- **Copied bodies (Tasks 1, 2):** each as built, with lines:
  - `private.chat_messages` (`chat_core.sql:284-293`), `private.chat_messages_since` (:304-317) and `private.my_chat_overview` (:334-364);
  - `private.send_message` (:464-504) and `private.send_announcement` (:513-555);
  - `private.notification_recipient_eligible`, from **plan 2's** body (challenge B2): plan 2 redefines chat core's (:652-692) for P2-Q1;
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
- **After a block or unblock (Tasks 4, 5):** chat core built `replace()` for this (`chatSession.ts:836-842`, `useChat.ts:35-36`; H25 Q3). `afterBlockChange` goes. After the challenge (B3), no screen calls `chat.replace()` itself: the safety gateway's app-wide "blocks changed" event reaches every mounted chat session, which calls it.
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

**Q1 is settled (P3-Q1, `.superpowers/sdd/challenges/chat-2-3-after-core-rulings.md`, binding):** Report and Block go wherever the announcement's words are shown in full to someone who can't open the chat: the invitation card in My resbites and the unanswered invitee's resbite page (`event.tsx:390-391` at `333747d`, H37 D3). The started, unanswered tile keeps its cut line (`plans.tsx:406-407`, H37 Q5) and opens the resbite page, where they are. Decision 14, Task 5.

**Bases (challenge B2, settled 12 November after plan 2 was built).** Every body this plan copies is copied from the latest migration that defines it (latest by the migration's timestamp), as built, and the rollback restores that same body byte for byte, `create or replace`, so its grants stay. Settled against `333747d`:

| Body this plan redefines | Base file | sha256 | Lines |
|---|---|---|---|
| `private.chat_summary(uuid)` | `20261111150000_chat_groups.sql` (plan 2) | `f7a34398040e04cd5cf412b29c0dd5260fd0f525b432f284f2f642aa18287d28` | 235-261 |
| `private.request_connection(uuid,uuid)` | plan 2's, as above | as above | 585-636 |
| `private.notification_recipient_eligible(bigint)` | plan 2's, as above | as above | 644-684 |
| `private.chat_messages(uuid,bigint,int)` | `20261111140000_chat_core.sql` | `1047fb379a4e8a942b49db3f7134674caecf2cbb30f67e0ebf9f0f2fea6a78ce` | 284-293 |
| `private.chat_messages_since(uuid,bigint,timestamptz)` | chat core's, as above | as above | 304-317 |
| `private.my_chat_overview()` | chat core's | as above | 334-364 |
| `private.send_message(uuid,text,uuid)` | chat core's | as above | 464-504 |
| `private.send_announcement(uuid,text,text,uuid)` | chat core's | as above | 513-555 |
| `public.claim_notification_deliveries(integer)` (I-3) | chat core's | as above | 705-773 |
| `private.request_account_deletion(uuid,uuid,uuid,text)` | chat core's, inside its `to_regprocedure` guard (the `do` block 814-877) | as above | 817-874 |
| `private.fold_web_account(uuid,uuid)` | chat core's | as above | 1000-1091 |
| `private.plan_connection_states(uuid)` | `20261110120000_connections.sql` | `1f403e42f97e9c2b619fe7a5d778bee0dfd2146d7fffc5a2114b24cb32d112d8` | 278-294 |
| `private.invite_contacts(uuid,jsonb)` | `20261111130000_circles_of_trust.sql` | `04062e2b091fa582f59a3d1ff9a322e8019ce671c64d532d5c113d0916d77256` | 301-443 |
| `private.contacts_on_resbite(text[])` | `20261030130000_phone_key.sql` | `d7cf188f6b63d14453a2b34d6c8c85838ed196d7a06e01e3bd94c66ae0a14667` | 92-107 |

Also the outbox kind check, chat core's 13 kinds (`chat_core.sql:380-382`). Plan 2's rollback is `eb1c530b63b74351043ca39658112288070c080ac2dcb5499f08a50ef824fb1a`.
- Plan 2 redefines, of the bodies copied here, only the first three (P2-Q1: in the chat branch only, `plan.status<>'cancelled'` becomes `case when private.chat_is_group(msg.series_id) then private.chat_open(msg.series_id) else plan.status<>'cancelled' end`, plan2.sql:677). It does **not** redefine the deletion, the fold, the claim, the three reads or the two writes: its fold change is the trigger `attendees_clear_leave` on `update of user_id` (plan2.sql:170-181), which the fold's own `update public.attendees` fires unchanged.
- Of those this plan only consumes, plan 2 redefines `private.chat_member` (plan2.sql:194-205), `chat_closes_at` (:211-219), `chat_open` (:225-229), `can_see_guests` (:571-577) and `private.chat_row(p_message, p_viewer)` (:708-717), which carries every row's `plan_id` (GR1) and leaves `place_label` out of `next` and `changed` payloads when `private.chat_place_hidden(p_series, p_viewer)` (:691-697) holds (G-QA). It adds `private.series_leaves`, `leave_series` (:522-555), `series_is_group` (:269-277, `private.eligible()` first, GR2 Q1) and the roll in series order that skips a closed group (:413-495, GR3 Q1).
- **The one build-time check:** before Task 1's Step 3 and again before Task 2's Step 5, `sha256sum` each base file in the table. Each must print its hash. If one doesn't, the base moved: stop and ask the controller, rather than copying from whichever file a glob lists last (a glob's order is not the migrations' order on every machine).

### After the challenge (12 November 2026)

From `.superpowers/sdd/challenges/chat-3-safety-after-core-challenge.md` (4 BLOCKING, 11 IMPORTANT, 14 NOTE, 5 owner questions), with the controller's rulings `chat-3-safety-after-core-rulings.md` and, from `chat-2-3-after-core-rulings.md`, P2-Q1 and P3-Q1 (all binding). One line each:
- **P3-Q1, B1:** an unanswered invitee's resbite page gets a "Report or block" action beside the announcement line and a "Report or block" row in More. `useEvent` gives the overview entry, not a string. Q1 leaves the open list. Decision 14, Tasks 4 and 5, runbook step 7.
- **P2-Q1, B2:** `notification_recipient_eligible`, and any other body plan 2 also redefines, is copied from plan 2's final migration at its recorded sha256, and the rollback restores plan 2's body. The implementer re-verifies each base at build time ("Bases" above; settled once plan 2 was built: the bases are named with their hashes, and only the hash check is left). Slice 1 tests a group's cancelled week. Tasks 1 and 2.
- **B3:** a block or unblock made anywhere emits one app-wide "blocks changed" event from `services/safety.ts`. Every mounted chat session hears it and calls `replace()`, so no screen calls `replace()` itself. Tests (s4b), (s4c), a session test and a source check. Decision 17, Tasks 4 and 5.
- **B4:** `block_user` also stores a block for the person who invited the caller (`brought_by` on the caller's row, or the actor of an `invited` notice to the caller on a plan the caller may read). `my_chat_overview` names that person. The card's long-press and the page's "Report or block" offer "Block <inviter>" to any unanswered invitee, with or without an announcement. Tasks 1, 4 and 5.
- **I1:** two slice 1 tests pin the filter inside the limit: a newest page whose 50 rows are all by the blocked person, and a `since` answer behind 150 of theirs. Task 1.
- **I2:** unblocking deletes the caller's own row whatever the caller may read now. Test. Task 1.
- **I3:** Connections gets Block on a request card and on a connection row, and Report on a request card. `report_user` admits the sender of a waiting request on its series. Tasks 2 and 5.
- **I4:** `fold_web_account`, copied from its latest body, moves the web account's blocks and reports to the kept account. The rollback restores the base. Task 2.
- **I5:** `contacts_on_resbite` leaves out a holder who blocked the caller. The rollback restores it. Task 1.
- **I6:** the session holds a rules refusal as `rulesNeeded`, with no action error, and `agreeRules()` sends each held item once with its own client id. A failed I agree sends nothing and says so. A refused announcement closes into the rules sheet with its words and audience. Each case has its own words, and none reads "Check your connection". Tests (s7b) to (s7d) and a session test. Tasks 4 and 5.
- **I7:** at most 20 reports per account per 24 hours (`22023 'Report limit'`, "You’ve sent a lot of reports today. Try again later."). One moderator push per 10 minutes per moderator. `report_filed` stays a non-chat kind, sent before chat pushes. Decision 16, Tasks 2 and 4.
- **I8:** the runbook's App Review step (6a): the review account, the support address in the installed build, and the address on the App Store listing. Task 7.
- **I9:** the rollback notes for this plan alone: the sender stays, the app goes first, and chat without this plan may not reach testers. Task 7.
- **I10, R-Q2:** `open-reports.sql` lists the blocks of the last 7 days beside the reports (who blocked whom and when, no text). No push for a block. Decision 15, Tasks 2 and 7.
- **I11, R-Q3 (as the controller corrected it: the spec wins):** the reports an account filed are deleted when it goes, as CH-P18 says, on every path. The deletion step deletes them, and `reporter_id … on delete cascade` takes them when a profile is removed any other way, as H42 made a departed author's words go however the profile went. The reports about it stay with their frozen text and keep the reported id until closed. A closed report is deleted 180 days after closing by `purge-closed-reports.sql`, which the daily read prompts (no existing purge job fits: `purge-deletion-receipts` is for deletion receipts and is not enabled). Decision 7, Tasks 2, 4, 6 and 7.
- **R-Q1:** Report the person goes wherever Block is on an invitation (the card and the page). `report_user` admits the owner, the inviter and an announcer whose audience holds the caller. Decision 14, Tasks 2, 4 and 5.
- **R-Q4:** the owner names a backup reader before the release (release-blocking). Until then the runbook says the owner alone reads the queue daily. Task 7.
- **R-Q5:** no push of any kind from a blocked person to the blocker, join requests included. The request still shows to every host, the blocker included, who can decline it. `plan_changed` and `plan_cancelled`, which name nobody and are the resbite's own news, still arrive (Review Focus 3). Decision 18, Task 1.
- **NOTEs taken, as corrections to the plan's text:**
  - N1: the one-a-minute test leaves out a blocked author's row;
  - N2: the pinned card and the invitation's announcement fall back inside the limit;
  - N3: per-caller counts by subtraction;
  - N4: terms that can match, a space matching any blanks, and the review notes' claim;
  - N5: the reports' `about` column;
  - N6: the lock order in the scripts and the rollback;
  - N8: the target is left out of its own report push, who can read reports, and the undo comment;
  - N9: the copy;
  - N11: the runbook's numbering;
  - N12: Known gaps;
  - N13: unknown blocks hide Block and Connect;
  - N14: tests that fail on their fault, and shown pushes in Known gaps.
- **NOTE listed, not taken (it adds scope):** N7, offering "Report <name>" from a message report the server refuses because the message is no longer sent. "You can’t report that any more." stays, and the person's name in the chat still opens Report <name>.

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
- **The blocked person is never told** (CH-P13). No message, state, error or count differs for them. A block reads to them exactly as a refusal or a removal of connections does (G-B1), or a number not on Resbite (Decision 11: the blocker's number in the contact lookup and in an invitation, challenge I5; confirmation NOTE 4).
- **Reports freeze the reported text** at the time of the report. Nothing else of the chat goes into a report.
- **No support address is invented.** It comes from `EXPO_PUBLIC_SUPPORT_ADDRESS`, set by the owner in the EAS production environment. While it is unset the app shows no contact line, and the release runbook blocks submission.
- **Shared interfaces** are the rulings' table (`.superpowers/sdd/challenges/chat-rulings.md`), verbatim. Where plan 1's or plan 2's text differs, the table wins. Where chat core's built code differs from either, the built code wins (Revised 12 November).
- **Bodies are copied from their latest definition as built** ("Bases", settled after plan 2 was built): plan 2's at sha256 `f7a34398…d28` for `chat_summary`, `request_connection` and `notification_recipient_eligible`, chat core's at sha256 `1047fb37…ce` for the reads, the writes, the claim, the deletion and the fold, and the connections, circles and phone_key migrations' at the hashes in that table. The rollback restores exactly the body it replaced. Only the private bodies change: chat core's public calls are invoker wrappers over them (e.g. `chat_core.sql:276-280`, :295-300). The one public body redefined is the worker's claim, `public.claim_notification_deliveries(integer)`, which has no private twin (I-3); `create or replace` keeps its grant (service_role only).
- **User-facing copy** writes the apostrophe as ’ (U+2019), as chat core's does (`chatCopy.ts`, H37 Q7). The server's error messages keep theirs as written.
- **Owner choices are built with the rulings' defaults** (roadmap, owner-decisions table): no blocked terms seeded, the owner as the one moderator, the rulings' chat-rules wording with the Terms document unchanged, and G-S13's default for invitations. The challenge's owner questions R-Q1 to R-Q5 are built with the controller's defaults (Decisions 7, 14, 15 and 18; the runbook's step 0).
- **Ops scripts are plain SQL for the dashboard SQL editor** (G-S12). Each has one literal, or one list, at the top to edit (`open-reports.sql` and `purge-closed-reports.sql` have none), and no psql meta-commands. Each runs in one transaction and prints counts or rows, never a phone number or an email of a reported person.
- A new table revokes all from `public, anon, authenticated, service_role`. A new function revokes execute from the same four before its explicit grants (K-S5).

## Decisions this plan makes

1. **Unblocking exists,** from the person's sheet ("Unblock Leo") and from Profile → Data & privacy → Blocked people (G-S10). A block made by mistake must be undoable, wherever the two last met.
2. **A block reads as a refusal** (G-B1, G-B2). The blocker asking the blocked person gets `22023 'Unblock first'`, so only the blocker learns anything. The blocked person asking the blocker leaves a visible refusal, as "Not now" does, and nothing is sent. Both checks run before every accept path.
3. **The chat menu's "Report or block"** opens a sheet listing the chat's people (CH-04's recommended option). Each row opens that person's report and block sheet. The entry is hidden when nobody else is in the chat (G-N7).
4. **Reasons:** Harassment · Spam · Not appropriate · Something else, plus an optional line of up to 500 characters (CH-P13).
5. **A join requester can be blocked, not reported** (G-S9). They are not on the resbite, so `report_user` would refuse them.
6. **One report per person per message** (G-N12). A repeat answers the same thanks and stores nothing.
7. **Deleting an account deletes the reports it filed** (CH-P18, G-S11, challenge I11), however the account goes: the deletion step deletes them, and `reporter_id … on delete cascade` takes them when a profile is removed any other way, as chat core's H42 made a departed author's words go. Reports about the person stay, with the frozen text, and keep `target_user_id` and `frozen_author` until they are closed. A closed report is deleted 180 days after closing (R-Q3; `private.report_keep_days()`, `purge-closed-reports.sql`).
8. **The chat rules come before a first message** (G-B4(d)). A one-time sheet, stored per person and version `2026-11`. The Terms document and `TERMS_VERSION` are the owner's, outside this plan.
9. **A blocked-terms list stops a message before it is stored** (G-B4(a)). The migration seeds nothing, and the owner fills the list before the release.
10. **Each new report pushes the moderators** (G-B4(c)) with "A new report is waiting.". The push carries no content, and its tap opens nothing.
11. **A blocked person can't reach the blocker by invitation in the app** (G-S13, owner default). Their `invited` notice is not eligible, and the blocker's number reads to them as an unknown one: no invitation in the app, and no "On Resbite" in the contact lookup (challenge I5).
12. **A host who blocks is told what they give up** (G-N9). There is no collapsed row for a blocked person's messages.
13. **Reporting and blocking work on a closed chat,** as Delete and Remove do (K-S17's default). Reporting is not writing.
14. **Report and Block on an invitation** (P3-Q1, challenges B1 and B4, R-Q1). Wherever an unanswered invitee sees someone's words and can't open the chat (the invitation card and the resbite page), they can report the announcement, and report or block its author, the person who invited them and the resbite's owner, whom the card ("Ana invited you") and the page ("Hosted by Ana") name (confirmation I-2), with or without an announcement. On a group a pending member is also in the chat (plan 2), and these entries stay for them too. These report people, not the resbite, so CH-P13's "Report this resbite" stays out of this build. The started, unanswered tile opens the page.
15. **A block reaches the team without a push** (challenge I10, R-Q2). `open-reports.sql` lists the blocks of the last 7 days beside the open reports: who blocked whom and when, never message text. Seven days covers a missed daily read.
16. **Reports have limits** (challenge I7). At most 20 per account per 24 hours, then `22023 'Report limit'`. A moderator gets at most one report push per 10 minutes, and the daily read lists every open report. Report pushes stay ahead of chat pushes in the claim.
17. **A block anywhere refreshes every open chat** (challenge B3). One app-wide event from the safety gateway reaches each mounted chat session, which replaces its list. A second phone signed in to the same account learns of it at its next full read (Known gaps).
18. **A blocked person's pushes stop** (R-Q5). No notice whose actor the recipient blocked is eligible, join requests included, except `plan_changed`, `plan_cancelled` and the roll's "<title> is on again" (`invited` with `detail 'again'`, whose actor is the owner, plan2.sql:470-475), which name nobody and are the resbite's own news (Review Focus 3; confirmation NOTE 3). No push names someone the recipient blocked either: the claim leaves a blocked bringer's name out of an `rsvp` push, so the host reads "Clara is going." (confirmation I-3). A blocked person's join request still shows to every host, the blocker included, who can decline it.

## Review Focus

1. **The blocked person keeps writing.** Expected: the blocker never sees their new messages, the pinned card, the Chat-row preview, an unread dot or any push from them, join requests included, or any push naming them, such as "brought by Leo" (R-Q5, I-3). Everyone else sees all of it. A page of history still holds 50 rows the blocker may see (I1). Test in Task 1.
2. **The blocked person asks to connect, had asked, or was connected.** Expected: they see "Request sent", or no request after a connection ends, exactly as after a refusal or a removal. No accept path connects them (G-B1, G-B2). Test in Task 1.
3. **Blocking a host.** Expected: the host's messages and announcements disappear for the blocker, the pinned card and the invitation-card line included, and an earlier host's announcement takes the pin (N2). The resbite's own changes (`plan_changed`, `plan_cancelled`) and a group's weekly "<title> is on again" still arrive (NOTE 3). The host's counts don't move (G-B3). Test in Task 1.
4. **A report reaches someone.** Expected: the frozen text stays even if the message is deleted. Each moderator but the reported person gets at most one push in 10 minutes, with no content (I7, N8). A 21st report in a day is refused. The team removes the message and suspends the account from the SQL editor (G-B4(b), (c)). Tests in Tasks 2 and 3.
5. **A first message from someone who never agreed to the chat rules.** Expected: the sheet comes first, and the server refuses without an acceptance. A blocked term is refused with "That message can’t be sent." Tests in Tasks 2 and 5.
6. **Two blocks between the same people (A blocks B, B blocks A).** Expected: each hides the other's messages, and either unblocking leaves the other block standing. Test in Task 1.
7. **The support address unset, then set, in a build.** Expected: unset (or not an address), Data & privacy shows no contact line and no empty placeholder, and the runbook blocks submission. Set, the address shows as selectable text with Copy and a mail link. Test in Task 6.
8. **A block made off the chat screen while the chat is open** (People in this chat, Blocked people, the invitation card). Expected: back on the chat, the person's rows are already gone, or back after an unblock, with no refocus needed (B3). Tests in Tasks 4 and 5.
9. **An unanswered invitee and the person who invited them,** with or without an announcement, the inviter a guest bringing them or a host. Expected: the card and the resbite page offer Report and Block for them, and for the owner the card and the page name, even when the overview read failed; the block stores, the line goes, and no further invitation or push from them arrives (B1, B4, R-Q1, I-2). Tests in Tasks 1, 2, 4 and 5.
10. **A refusal for the chat rules, or a failed I agree.** Expected: the rules sheet with its own words, never "Check your connection" for a refusal; nothing sent before I agree; after it, each held message sent once with its own client id, and a held announcement with its words and audience (I6). Tests in Task 5.

---

### Task 1: Migration section 1: blocks and the block rule everywhere

**Files:**
- Create: `supabase/migrations/20261111160000_chat_safety.sql` (section 1), `supabase/tests/chat-safety.sql` (slice 1; add it to `supabase/tests/hosted-baseline/tests.txt`, after `chat-groups.sql`), `supabase/tests/hosted-baseline/20261111160000_chat_safety.after.sql` (first assertions)
- Modify: `supabase/tests/chat.sql`, the overview assertions the new `inviters` key changes (confirmation I-1; Step 3)

**Interfaces:**
- Consumes, as chat core built them at sha256 `1047fb37…ce`:
  - `private.chat_messages(p_series, p_before, p_limit)` (`chat_core.sql:284-293`; `p_limit` clamped to 1..100, 50 when null);
  - `private.chat_messages_since(p_series, p_after, p_changed_after)` (:304-317; up to 200 rows; a null cursor tests ids only);
  - `private.my_chat_overview()` (:334-364);
  - `private.send_message(p_series, p_body, p_client_id)` (:464-504);
  - `public.claim_notification_deliveries(p_limit)` (:705-773), with its `brought_by_name` subquery (:757-759, an `rsvp` only) (I-3);
  - `private.chat_members` (:143-150) and `private.announcement_audience(p_series, p_audience) returns setof uuid` (:184-193);
  - `private.chat_names` (:222-235), which every read uses for its `names`;
  - `private.chat_first_name(p_user)` (:201-203).

  From plan 2's migration at sha256 `f7a34398…d28` (Bases): the bodies of `private.chat_summary` (plan2.sql:235-261), `private.request_connection` (:585-636) and `private.notification_recipient_eligible(p_outbox)` (:644-684: chat core's three branches, the plan kinds :646-660, the connection kinds :661-669 and the chat kinds :670-683, with plan 2's group `case` at :677, P2-Q1). Consumed as plan 2 redefines them: `private.chat_member` (:194-205: on a group, any guest row on the current occurrence, but a leaver once it has ended), `private.chat_open` (:225-229), `private.can_see_guests` (:571-577) and `private.chat_row(p_message, p_viewer)` (:708-717: every row's `plan_id`, and no `place_label` in a `next` or `changed` line for a reader `private.chat_place_hidden` (:691-697) hides it from). `private.plan_connection_states` (`20261110120000_connections.sql:278-294`); `private.invite_contacts` (`20261111130000_circles_of_trust.sql:301-443`); `private.contacts_on_resbite(p_phones)` (`20261030130000_phone_key.sql:92-107`, behind the invite screen's "On Resbite", `mobile/src/services/contactInvites.ts:109-112`); `private.can_read_profile` (`20261110120000_connections.sql:304-310`; a pending invitee reads the owner, :306-307); the connection functions' pair lock, `hashtextextended(a||':'||b, 53)`. Neither chat core nor plan 2 redefined these last four. Also `private.can_read_plan`; the outbox's `invited` rows, kept after delivery, one per plan and person (`dedupe_key 'invited:'||plan||':'||user`, `actor_id` the inviter, set at `circles_of_trust.sql:369` and :418; the roll's has the owner as actor and `detail 'again'`, plan2.sql:470-475), deleted with the guest row when a bringer takes back an invitation (`circles_of_trust.sql:218`), on `remove_guest` (:669) and on `leave_series` (plan2.sql:552); and the open-link requests, `private.join_requests` and `public.plan_join_requests(p_plan)` (`20261029120000_open_link_approval.sql:271`).
- Produces:
  - `private.blocks (blocker_id uuid references public.profiles(id) on delete cascade, blocked_id uuid references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id))`, index on `blocked_id`. RLS on, no policies, all revoked from the four roles.
  - `private.invited_by(p_plan uuid, p_by uuid) returns boolean` (challenge B4), SQL, reading `auth.uid()`, no grants: the caller's attendee row on `p_plan` has `brought_by = p_by`, or an `invited` outbox row to the caller on `p_plan` has `actor_id = p_by`.
  - `private.inviter_of(p_plan uuid) returns uuid` (challenge B4), SQL, reading `auth.uid()`, no grants: the one person the app names as the caller's inviter on `p_plan`. That is the caller's row's `brought_by`, else the `actor_id` of the caller's `invited` outbox row on `p_plan` when it names someone, else the plan's owner.
  - `public.block_user(p_user uuid, p_block boolean) returns void`, with `private.block_user`:
    - `22023 'That is you'` for oneself;
    - takes the pair's advisory lock first, as the connection functions do;
    - when blocking (`p_block = true`), an id the caller may not read gets the same success and stores nothing (G-N12). The caller may read `p_user` when one of these holds:
      - `private.can_read_profile(p_user)`;
      - `p_user` wrote a `message` or `announcement` in a chat the caller is a member of now;
      - `p_user` wrote an announcement whose audience includes the caller now (`private.announcement_audience`), as a pending invitee meets it on the invitation card (confirmation S7);
      - `p_user` has a waiting join request on a resbite the caller hosts;
      - `p_user` invited the caller: `private.invited_by(plan, p_user)` for a plan the caller may read (`private.can_read_plan`) (challenge B4). That reaches a guest who brought the caller and a host who invited them in the app, neither of whom an unanswered invitee may otherwise read;
    - blocking inserts the block (`on conflict do nothing`), then leaves the pair as the refusal machinery would (G-B1):
      - connected: the row goes, and a hidden refusal stays as `remove_connection` leaves it (`from_user` the blocked person, `to_user` the blocker, the row's series, `hidden = true`);
      - a request by the blocked person: the row goes, and a visible refusal stays on the request's series as `decline_connection` leaves it (`hidden = false`);
      - a request by the blocker: the row goes as `cancel_connection_request` takes it, its hiding of the blocker's refusals included;
    - unblocking (`p_block = false`) deletes the caller's own block of `p_user`, whatever the caller may read now (challenge I2), and nothing else. Refusals stay, as after a "Not now";
    - silent either way. Execute granted to `authenticated` only.
  - `public.my_blocks() returns jsonb`, with `private.my_blocks`: `[{user_id, name}]` for the people the caller blocked, newest first. `name` is `private.chat_first_name(user_id)` (`chat_core.sql:201-203`), the helper behind the shared `names` map: the first word of `display_name`, or null for a deleted, deleting or folded profile (G-S10). Granted to `authenticated` only.
  - Chat reads redefined, each copied from the built private body (`private.chat_messages` :284-293, `private.chat_messages_since` :304-317, `private.my_chat_overview` :334-364). The public invoker wrappers stay as built (:295-300 with `chat_messages`' defaults, :319-324, :366-370). The reads skip `kind in ('message','announcement')` rows whose author the caller blocked. System lines are never skipped. The `names` map covers the rows returned, as `chat_names(v_rows)` already does. Every row these copies return, and every per-caller `last` and `pinned` below, is still built with `private.chat_row(m, v_uid)`, which plan 2 redefines (plan2.sql:708-717) so every row carries its `plan_id` (GR1) and a `next` or `changed` line leaves out `place_label` for a reader `private.chat_place_hidden(series, viewer)` says sees only the area (plan 2's Decision 11, G-QA). Built that way, plan 2's place rule carries over into every read this plan copies; a row built any other way would hand the place back.
    - **The skip goes inside the inner `select … order by … limit`** (:289-291 and :312-315), not after it. A page then still holds up to `p_limit` rows the caller may see, and a `since` answer up to 200. The app reads a newest page shorter than 50 as "nothing earlier to load" (`chatSession.ts:329`), and a full answer of 200 as a gap that replaces the list (`chatModel.ts:9`, H22).
  - `my_chat_overview()` also (G-B3), where the built body reads the chat's own figures:
    - `last` is the built `chats.last_message_id` row (:345). It becomes the newest row the caller may see, leaving out a `system` row whose state is `deleted` (plan 2's Decision 6), so it falls back to the previous visible row (confirmation 2, SHOULD 4);
    - `unread` is the built test (`state = 'sent'`, after the caller's read, not theirs and not a line about something they did; :338-339), applied only to rows the caller may see;
    - `count` is `chats.message_count` as built (:343). It becomes the `state='sent'` messages and announcements the caller may see (K-N12, confirmation NOTE 6): `message_count` less the chat's sent messages and announcements by authors the caller blocked, with that subquery skipped when the caller has blocked nobody, so a reader with no block pays nothing (challenge N3);
    - `announcements` keeps the built rule: for the caller's unanswered row on a series' current occurrence, while it is active and hasn't ended, the latest sent announcement whose audience includes the caller (H22, H23; :351-362). That is not only `everyone` ones: on a group a pending member is in both audiences. The rule gains "whose author the caller has not blocked", **inside** the `order by m.id desc limit 1` lateral (:356-359), so it falls back to the latest announcement by someone else (challenge N2). Its `id` stays (S7);
    - it gains `inviters` (challenge B4), always present, `{}` when empty: `{"<plan_id>": "<user id>"}` for the caller's unanswered rows on a series' current occurrence that is active and has not ended, **whether or not an announcement exists** (confirmation NOTE 6; the built announcements query, :354-362, yields no row without one, so `inviters` is its own query over the same rows, not a column of that one). The user is `private.inviter_of(plan)`, left out when the caller blocked them. `names` also covers each inviter, as it covers each announcement's author (:363). On a group, every member who hasn't answered this week's occurrence has an entry (plan 2's roll makes each a pending row, with the owner as the `invited` notice's actor or their carried bringer).
  - `private.chat_summary` redefined, copied from **plan 2's** body (plan2.sql:235-261: chat core's :248-274 with `stopped` read from `private.group_stopped`, :247) (G-B3); `public.chat_summary` stays:
    - `pinned` is the built `chats.pinned_message_id` row (plan2.sql:241), the latest sent announcement (K-S12). When the caller blocked its author, it is the latest sent announcement by an author the caller has not blocked, the clause inside that pick's limit (challenge N2), or null when there is none;
    - `last` (the built `chats.last_message_id` row, plan2.sql:242, which plan 2's `chat_hide_line` already moves off a hidden line) is the newest row the caller may see, leaving out a `system` row whose state is `deleted`, as in `my_chat_overview`. `names` covers only what is returned (`chat_names` of `pinned` and `last`, plan2.sql:254);
    - `unread` as in `my_chat_overview` (plan2.sql:258-259), and `message_count` (built `chats.message_count`, plan2.sql:260) counts the `state='sent'` messages and announcements the caller may see, by the same subtraction (challenge N3);
    - `going` and `everyone` ignore every block, so the blocked person's counts never move (G-B1). They are built on `announcement_audience` (plan2.sql:252-253), which this plan doesn't touch; every other key (`is_group`, `stopped`, `closes_at`, `open`, `members`) stays as plan 2 built it;
    - Task 2 adds `rules_accepted`.
  - `private.notification_recipient_eligible` redefined, copied from **plan 2's** body (plan2.sql:644-684, challenge B2): chat core's (:652-692) with plan 2's chat branch, where `case when private.chat_is_group(msg.series_id) then private.chat_open(msg.series_id) else plan.status<>'cancelled' end` (plan2.sql:677) stands in for the built `plan.status<>'cancelled'` (chat core :685, P2-Q1). That `case` stays exactly as plan 2 built it. Not eligible when the recipient blocked the notice's actor (G-S13, R-Q5):
    - in the chat branch (plan2.sql:670-683), the message's author `msg.author_id`, for `chat_message` and `announcement`;
    - in the first branch (plan2.sql:646-660), `o.actor_id`, for every kind but `plan_changed`, `plan_cancelled` and an `invited` row with `detail = 'again'`: `invited` (any other detail), `join_request`, `rsvp`, `invitation`, `join_approved`, `guest_note` and `admin_added` (R-Q5, Decision 18). The three left out name nobody and are the resbite's own news, so a blocker still learns that the resbite moved, is off, or (on a group) is on again: the roll writes "again" with the owner as actor (plan2.sql:470-475), and its copy is "<title> is on again" (`notification-copy.ts:197-199`; confirmation NOTE 3);
    - in the connection branch (plan2.sql:661-669), `o.actor_id` too. No pair row survives a block, so this only guards.

    A blocked person's join request is still stored and still listed by `plan_join_requests` to every host, the blocker included, who can decline it.
  - `private.request_connection` redefined, copied from **plan 2's** body (plan2.sql:585-636), with its pair lock first (:588-589) and its `detail` kept. Its checks, in order (G-B2):
    1. `22023 'That is you'` (:590);
    2. the two visibility refusals as plan 2 built them, `42501 'Names required'` (:591) and `42501 'Not on this resbite'` (:596-601, where on a group the person asked may be any guest in its chat now, and anyone else only as on a one-off, GR3 Q2), which never depend on the pair;
    3. a block by the caller of `p_user` → `22023 'Unblock first'`;
    4. a block by `p_user` of the caller → insert `connection_refusals(series_id = the plan's series, from_user = caller, to_user = p_user, hidden = false) on conflict (series_id, from_user, to_user) do update set hidden = false`, queue nothing, and return `'requested'` (G-B1). The plan's series is `v_series`, which the built body reads only after these checks (:602): read it before step 3;
    5. then the pair row and every accept path, unchanged.

    A blocked person who asks where they may not ask gets the same 42501 as anyone, because the block checks come after the visibility refusals.
  - `private.plan_connection_states` redefined: `none` for people the caller blocked. `my_connections` is not redefined: no pair row survives a block, so it shows none already (CH-R-A5, confirmation B2).
  - `private.send_message` redefined, copied from the built body (:464-504). Its `chat_message` fan-out (:494-501, `from private.chat_members(p_series) as r(id) where r.id <> v_uid and not exists (…60 seconds…)`) leaves out every recipient who blocked the author: `and not exists (select 1 from private.blocks b where b.blocker_id = r.id and b.blocked_id = v_uid)` (confirmation S2). The 60-second test (:497-500) also leaves out a queued row whose message's author the recipient blocked: `and not exists (select 1 from private.blocks b where b.blocker_id = r.id and b.blocked_id = m.author_id)` inside it (challenge N1). So a blocked author's row queued in the minute before the block never takes the blocker's one push that minute either. The coalescing lock (the chat's advisory lock, :484) and rule stay as built. The eligibility check stays as the second guard. Task 2 adds its two checks to this same body.
  - `private.invite_contacts` redefined, copied from the circles migration with its non-host branch (G-S13). A phone item whose holder blocked the caller takes the unknown-number path (`'link'`): a personal invitation, and no attendee row, no notice and no `'app'` answer. The result never tells the inviter.
  - `private.contacts_on_resbite(p_phones)` redefined, copied from the phone_key migration (`20261030130000_phone_key.sql:92-106`; nothing later redefines it). A holder who blocked the caller is left out, `and not exists (select 1 from private.blocks b where b.blocker_id = u.id and b.blocked_id = v_uid)` beside the built `u.id <> v_uid` (challenge I5). The invite screen then shows no "On Resbite" for them, so its `'link'` answer matches what it said. The lookup budget is charged for every number, as built.
  - `public.claim_notification_deliveries(p_limit)` redefined, copied from **chat core's** body (`chat_core.sql:705-773`; neither plan 2 nor anything later redefines it), `create or replace`, its grant kept (service_role only) (confirmation I-3, R-Q5's "come from or name"). One clause, in the `brought_by_name` subquery (:757-759): `and not exists (select 1 from private.blocks k where k.blocker_id = o.recipient_id and k.blocked_id = b.id)`. So a host who blocked the bringer gets the answer without the name ("Clara is going.", `notification-copy.ts:72`), and every other host's push still names them. A host who blocked the answerer gets no `rsvp` at all: its actor is the answerer, so eligibility leaves it out (above). Nothing else in the claim changes; `report_filed` (Task 2) needs nothing of it.

- [ ] **Step 1: Failing SQL test, slice 1** (`supabase/tests/chat-safety.sql`; ids use the hex prefix `e7` and emails `s3-…@resbite-test.invalid`, one rolled-back block per slice as `supabase/tests/connections.sql` does; every sender accepts the chat rules in the setup, written as a `do` block that runs the insert with `execute` only when `to_regclass('private.chat_rules_acceptances')` is not null, since the table arrives in Task 2 and a plain insert into a missing table fails at parse time (confirmation 2, SHOULD 3; CH-R-A8); owner 01, admin 02, guests 03, 04, 05 and 07 Going, 06 pending, 08 stranger; a one-off, a group, and a third plan of another series (owned by 01, with 02 its admin too, for I-3) with 03 and 04 Going; 03 and 04 connected on the group's series. For the challenge's tests also: 11 and 12 pending on the third plan, 11 with `brought_by` 03, and 12 with no `brought_by` and an `invited` outbox row whose actor is 04, both set by hand as an in-app invitation leaves them; 13 Going on the one-off; an open link on the one-off; confirmed numbers for 01 and 03), pinning the Review Focus:
```sql
-- N1, on the one-off, before 03's block: 04 writes, and a chat_message row to 03 is queued. 03 blocks 04, and 05 writes
--   within that minute: 03 gets a chat_message row for 05's message (the blocked author's row no longer counts).
-- 03 blocks 04: 03's chat_messages and chat_messages_since skip 04's messages and announcements and keep system lines.
--   05 still sees them.
-- NOTE 1: before S2, every chat_message outbox row queued so far is moved to created_at = now() - interval '61 seconds'
--   (now() is the transaction's start, which send_message's 60-second test reads), so N1's row to 05 doesn't hold back
--   S2's.
-- S2: 04's new message queues no chat_message row for 03. The one for 05 is queued and eligible.
--   05 writes 20 seconds after 04: 03 has one chat_message row this minute, for 05's message, and it is eligible.
-- my_chat_overview and chat_summary for 03 never show 04's text as last. Their counts leave 04's messages out.
-- SHOULD 4, on the group with 05's message the newest row: 07 says Can't go, then Going within 10 minutes, so its
--   cant_go line reads state 'deleted'. For 03, my_chat_overview.last and chat_summary.last are 05's message.
-- G-B3 unread: 04's message is the newest row. 03 marks read the newest id 03 can see:
--   chat_summary.unread false and my_chat_overview unread false for 03.
-- 03 blocks host 02: 02's announcement (on the group's series, not the one-off, so S7's first announcement below is not 'Too fast') is hidden from 03 and not eligible for 03. chat_summary.pinned for 03 is null (no other announcement yet).
-- N2: 01 then announces on the group: chat_summary.pinned for 03 is 01's. 02 announces again (its first set to
--   created_at = now() - interval '61 seconds', NOTE 1): pinned for 03 is still 01's, and for 05 it is 02's.
--   A place change by 02 still writes a line and queues a plan_changed notice to 03, and it is eligible (R-Q5 keeps the
--   resbite's own news).
-- S7, on the one-off where 06 is pending: 01 announces to everyone, then 02 does. 06 blocks 02: a block row (02's announcement reaches 06).
--   Set 02's announcement's created_at = now() - interval '61 seconds' (NOTE 1), so plan 1's 'Too fast' doesn't answer
--   the next one.
--   02 announces to everyone again: my_chat_overview.announcements as 06 is 01's announcement, never 02's (N2: the
--   pick falls back inside its limit). inviters[one-off] as 06 is 01 (no bringer, no 'invited' row: the owner).
-- I-2, after S7: block_user(01) as 06 (pending on the one-off; 01 its owner, whom the card names and whom
--   can_read_profile lets a pending invitee read, connections.sql:306-307): a block row. 06's my_chat_overview then has
--   no announcements entry and no inviters entry for the one-off (both announcers and the inviter blocked).
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
-- I2: 03 blocks 13 (Going on the one-off, never writes). 01 removes 13, who now shares nothing with 03:
--   block_user(13, false) as 03 deletes the row.
-- B4, on the third plan, which has no announcement: my_chat_overview as 11: inviters[third plan] is 03, and names[03]
--   is 03's first name. As 12: inviters[third plan] is 04. block_user(03) as 11 (brought by 03): a row, and 11's
--   overview then has no inviters entry for the third plan. block_user(04) as 12 (an 'invited' notice from 04): a row.
--   block_user(03) as 12, whom 12 may not read: success, no row.
-- my_blocks as 03: [{user_id, name}] newest first, name the first word of display_name. With 04's profile marked as
--   deleting (deletion_requested_at set by hand, in a savepoint rolled back after, so 04 can still write in I1 and B2):
--   name null.
-- G-S13: 03 blocks 01. 01 invites 03's number by phone: kind 'link', no attendee row for 03, no 'invited' outbox row.
--   An 'invited' notice from 01 to 03 queued before the block is not eligible.
-- NOTE 3: an 'invited' row from 01 to 03 on the group's current occurrence (where 03 has a row) with detail 'again',
--   made by hand as plan 2's roll writes it (plan2.sql:470-475), is eligible after 03's block of 01. With its detail set
--   to null it is not.
-- I5: contacts_on_resbite as 01 with 03's number: empty (it held 03's digits before the block).
-- R-Q5: 08 asks to join the one-off by its open link, and 01 then blocks 08 (readable as a waiting requester): the
--   join_request notice to 01 is not eligible, the one to 02 is, and plan_join_requests as 01 still lists 08's request.
-- I-3 (the claim; confirmation I-3), in a savepoint: every outbox row queued so far set expanded_at and delivered_at =
--   now(); a device each for 01 and 02 (private.device_endpoints, by hand). 01 blocks 03. 11 (pending on the third
--   plan, brought by 03) answers Going there with public.respond: an rsvp row to 01 and one to 02 (private.host_ids).
--   One public.claim_notification_deliveries(25), as postgres, returns both rsvp jobs: 01's with brought_by_name null,
--   02's with brought_by_name 03's first name. Rolled back, then again in a savepoint with 01 blocking 11 instead:
--   the claim returns no rsvp job for 01 (R-Q5's actor clause) and 02's names 03. Roll back to the savepoint.
-- I1, the skip inside the limit, after 03 blocks 04 again (it unblocked 04 above), on the third plan's chat (01 owns it;
--   rows inserted by hand, each with created_at = now() - interval '2 minutes', so they stay out of send_message's
--   one-minute 'Slow down' count for B2's write below, NOTE 1): 01 writes 60 messages, then 04
--   writes 60, so the newest 50 are all 04's. chat_messages(third, null, 50) as 03: 50 rows, none by 04.
--   chat_messages(third, <the oldest id returned>, 50) as 03: more rows. From a cursor id, 04 writes 150 and then 01
--   writes 60: chat_messages_since(third, <cursor>, null) as 03 returns exactly 01's 60 rows.
-- B2 (P2-Q1, plan 2's eligibility kept), last, while I1's block of 04 by 03 stands: on the group, Cancel just this one
--   (change_plan_v4 with p_cancel true, p_stop_repeating false), then 04 writes: the chat_message to 05 is eligible,
--   and none is queued for 03.
```
- [ ] **Step 2: Run** `bash scripts/test-database-docker.sh` → FAIL (`public.block_user` missing).
- [ ] **Step 3: Implement** section 1, after checking the base hashes ("Bases"). Then change chat core's overview assertions in `supabase/tests/chat.sql` that `inviters` changes (confirmation I-1; lines at `333747d`, where plan 2 already moved and loosened some):
  - `:553` (as 03): `pg_temp.ch_keys(o)='announcements,chats,inviters,names'`. 03 has no unanswered row (Going on both, and set Going on the rolled occurrence at :334-335), so its `inviters` is `{}`, and `:561`'s exact `names` (`{04: 'Leo'}`) stays as it is;
  - `:565-569` (as 05), the whole overview: add `'inviters',jsonb_build_object(pg_temp.c1p('01')::text,pg_temp.c1('01'),v_next::text,pg_temp.c1('01'))`. 05 is pending on the one-off (no bringer, no `invited` row: the owner 01) and on the rolled weekly occurrence `v_next` (the roll's `invited` row, actor 01, :320 runs the roll). `names` stays `jsonb_build_object(pg_temp.c1('01')::text,'Ana')`: 01 is already named as the announcement's author;
  - `:574` (as 07, who answered Can't go after Going): add `'inviters','{}'::jsonb`;
  - no change at `:619-620` or `:884-886` (the confirmation's chat-core-era `:614-615` and `:877-879`): plan 2 made both partial checks, and `:884-886`'s `o->'names'@>…` still holds when 01 joins `names` through 05's `inviters`.
- [ ] **Step 4: Run** every test file in both modes (`bash scripts/test-database-docker.sh`, then with `--hosted-baseline` and its candidates) → PASS. For now `after.sql` asserts that `private.blocks` exists with RLS on and no grants, that `block_user` and `my_blocks` are executable by `authenticated` only, that `invited_by` and `inviter_of` are executable by no API role, and that `public.claim_notification_deliveries(integer)` is still executable by `service_role` only.
- [ ] **Step 5: Commit:** `"Safety: blocks, and the block rule in every read and every way to connect"`

### Task 2: Migration section 2: reports, moderators, chat rules, blocked terms, deletion and the ops scripts

**Files:**
- Modify: `supabase/migrations/20261111160000_chat_safety.sql` (section 2), `supabase/tests/chat-safety.sql` (slice 2), `supabase/tests/chat.sql` (the guarded rules acceptance, and `:227-229`'s `chat_summary` key list, confirmation I-1), `supabase/tests/chat-groups.sql` (the guarded acceptance inside `pg_temp.e6_cast()`, chat-groups.sql:88-118, which every block runs first), plan 1's `supabase/tests/local/chat-send-concurrency.sh` and this plan's own `supabase/tests/chat-safety.sql` (each sender accepts the chat rules in the setup, each a `do` block with `execute`, guarded by `to_regclass('private.chat_rules_acceptances')`, so plans 1 and 2 keep passing in both modes, confirmation S6), `supabase/tests/hosted-baseline/20261111160000_chat_safety.after.sql` (complete it). Plan 2's two local race scripts (`chat-groups-concurrency.sh`, `leave-series-concurrency.sh`) insert their messages by hand and send none, so they need no acceptance.
- Create: `supabase/ops/open-reports.sql`, `supabase/ops/close-report.sql`, `supabase/ops/remove-reported-message.sql`, `supabase/ops/suspend-account.sql`, `supabase/ops/moderators.sql`, `supabase/ops/blocked-terms.sql`, `supabase/ops/purge-closed-reports.sql`, `supabase/rollback/20261111160000_chat_safety.rollback.sql`, `supabase/tests/hosted-baseline/20261111160000_chat_safety.before.sql`

**Interfaces:**
- Consumes, as built at sha256 `1047fb37…ce`:
  - section 1;
  - `private.send_message` (`chat_core.sql:464-504`) and `private.send_announcement` (:513-555). Their order of checks is :444-463: the client-id repeat, membership (or host), open, the words (and audience), the author's lock and the limits, the chat's lock, the insert, the notices;
  - `private.chat_body(p_body)` (:433-441), the trim and the visible-character rule, null over 16,000 bytes;
  - the guarded `private.request_account_deletion` (the `do` block :814-877, its statement :817-874: it runs `create or replace` through `execute` only when `to_regprocedure` finds it, with `set_config('resbite.system','deletion',true)` at :837). Plan 2 does not redefine it (Bases);
  - the outbox kind check with chat core's 13 kinds (:379-382);
  - the worker's claim, `public.claim_notification_deliveries(p_limit)`, as section 1 redefines it from chat core's :705-773 (I-3), which expands (:712) and picks (:743) every kind but the two chat kinds first;
  - `private.fold_web_account(p_from, p_into)` (:1000-1091, its step "3b" moving messages and line payloads, then "4. The web profile", :1089). Plan 2 does not redefine it (Bases): its `attendees_clear_leave` trigger fires on the fold's own `update public.attendees set user_id` (:1016) and needs nothing here;
  - Task 1's `private.invited_by`; `public.connections` (a waiting request: `state = 'requested'`, `requested_by`, `series_id`); `private.can_read_plan` and `private.deletion_pending`.
- Produces:
  - `private.reports`, RLS on, no policies, all revoked from the four roles, with these columns:
    - `id bigint generated always as identity primary key`;
    - `reporter_id uuid null references public.profiles(id) on delete cascade` (CH-P18, Decision 7: a profile removed any way, by hand on hosted included, takes the reports it filed, as `messages_touch` takes a departed author's words whatever way the profile went, H42), `target_user_id uuid null`, `message_id bigint null references public.messages(id) on delete set null`, `series_id uuid null`, `plan_id uuid null`;
    - `about text not null check (about in ('message','user'))`: what was reported, which outlives the message row (challenge N5);
    - `reason text not null check (reason in ('harassment','spam','inappropriate','other'))`, `details text null check (details is null or char_length(details) <= 500)`;
    - `frozen_body text null`, `frozen_author uuid null`;
    - `created_at timestamptz not null default now()`;
    - `status text not null default 'open' check (status in ('open','reviewed','actioned'))`, `reviewed_at timestamptz null`, `review_note text null`;
    - `action text null check (action is null or action in ('none','message_removed','account_suspended','both'))` (G-B4(b)).
    - A unique index on `(reporter_id, message_id) where message_id is not null` (G-N12).
    - A unique index on `(reporter_id, target_user_id, series_id) where about = 'user' and status = 'open'`: one open report per reporter, person and series (confirmation NOTE 8). It is keyed on `about`, not on `message_id is null`, so a message report whose message row goes (`on delete set null`) never collides with an open report about the same person (challenge N5).
  - `private.moderators (user_id uuid primary key references public.profiles(id) on delete cascade)` (G-B4(c)). RLS on, no policies, all revoked.
  - `private.chat_rules_acceptances (user_id uuid not null references public.profiles(id) on delete cascade, version text not null, accepted_at timestamptz not null default now(), primary key (user_id, version))` (G-B4(d)). RLS on, no policies, all revoked.
  - `private.blocked_terms (term text primary key check (term = lower(btrim(term)) and char_length(term) between 1 and 80 and term !~ '[][\\.^$*+?(){}|]'))` (G-B4(a)). The check keeps regex characters out, so a term always matches literally. It also requires `term ~ '^\w(.*\w)?$'`, a word character first and last, so `\m` and `\M` can hold (`@ss` or `n-` could never match), and `term !~ '\s\s|[^\S ]'`, words one space apart with no other blank (challenge N4). The migration seeds nothing. RLS on, no policies, all revoked.
  - `private.chat_rules_version() returns text`: `'2026-11'`, the one place the version lives. No grants.
  - `private.report_keep_days() returns integer`: `180`, the one place the period a closed report is kept lives (the ruling on I11, R-Q3). `open-reports.sql` and `purge-closed-reports.sql` read it. No grants.
  - `public.accept_chat_rules() returns void`, with `private.accept_chat_rules`: inserts (caller, `chat_rules_version()`) `on conflict do nothing`. Granted to `authenticated` only.
  - `private.chat_summary`, section 1's body, gains `rules_accepted` (bool: the caller accepted the current version). The app reads it as `rulesAccepted`.
  - Section 1's `send_message` body gains two checks, and `private.send_announcement` is redefined, copied from the built body (:513-555), with the same two:
    - right after the built `chat_open` check (`send_message` :474, `send_announcement` :524): no acceptance of the current version → `22023 'Rules not accepted'`;
    - right after `private.chat_body` returns a body (`send_message` :475-476, `send_announcement` :525-528): `v_body`, the body as plan 1 trimmed it (chat_body's trim, the one that also strips U+00A0 and the other blanks), matches a blocked term, `v_body ~* ('\m' || replace(term, ' ', '\s+') || '\M')`, → `22023 'Not allowed'`. A space in a term matches any run of blanks or a line break (challenge N4). One trim rule, plan 1's, serves both checks (confirmation 2, NOTE 6). `chat_body` refuses over 16,000 bytes before any pattern (H42), so no term is ever matched against a huge body.
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
  - `public.report_user(p_user uuid, p_series uuid, p_reason text, p_details text default null) returns void`: allowed when some occurrence `o` of `p_series` has `private.can_see_guests(o)` for the caller, and `p_user` is its owner, an admin or has an attendee row on it (G-S9). It is also allowed when `p_user` wrote a `message` or `announcement` in `p_series` and the caller is `private.chat_member` of it now, the test `block_user` uses (confirmation S5). That reaches a one-off guest the host removed after they wrote. It is also allowed (R-Q1) when the caller has an attendee row on an occurrence `o` of `p_series`, whatever its reply, and `p_user` is `o`'s owner or `private.invited_by(o, p_user)`; and when `p_user` wrote an announcement in `p_series` whose audience includes the caller now. And (challenge I3) when a connection request from `p_user` to the caller on `p_series` is waiting (`public.connections`, `state = 'requested'`, `requested_by = p_user`). So an unanswered one-off invitee can report the owner, the person who invited them and an announcer, and the person a request reached can report its sender, none of which `can_see_guests` admits. Otherwise, and for oneself, `22023 'Report unavailable'`. `plan_id` is the latest occurrence that admits the report, or the plan of the author's latest message there, or for a waiting request the series' current occurrence (`private.current_occurrence`). A second open report by the same person about the same person on the series stores nothing, queues nothing, and returns the same success (NOTE 8). Granted to `authenticated` only.
  - Both report functions, after their allowed check, in this order (challenge I7):
    - the caller's lock, `hashtextextended(v_uid::text, 47)`, the author's lock chat core's writes take (`send_message` :479, `send_announcement` :530; confirmation NOTE 8), so one person's reports meet the limit one at a time;
    - a repeat (the same message, or an open report about the same person on the series) stores nothing, queues nothing and returns success (G-N12, NOTE 8), so a repeat never reads as the limit;
    - the limit: with 20 or more reports by the caller whose `created_at` is in the last 24 hours, whatever their status, `22023 'Report limit'`, and nothing stored;
    - the insert, then the notices.
  - Both report functions queue `report_filed` to every moderator but the reporter and the report's target (challenge N8): `plan_id` the report's, `actor_id` null, no `message_id`, `dedupe_key 'report:'||id||':'||moderator` (G-B4(c)).
    - Coalesced (challenge I7): after the advisory lock `hashtextextended('report_filed', 0)`, taken after the caller's, no row is queued for a moderator who already has a `report_filed` row created in the last 10 minutes. The daily read lists every open report, so none is missed.
    - `plan_id` is required: the claim joins `public.plans` on it (`chat_core.sql:767`), and the sender refuses a job whose `plan_id` isn't a uuid (`notification-engine.ts:86-95`).
    - With no `message_id`, the claim's chat fields (`series_id`, `message_body`, `audience`, :761-763) are null for it.
    - It is not a chat kind, so the claim expands and picks it before any chat job (:712, :743): a report never waits behind a lively chat.
  - `notification_outbox_kind_check` re-added with chat core's 13 kinds (:381-382) plus `report_filed`.
  - `notification_recipient_eligible`, section 1's body, gains a fourth branch for `report_filed`: the recipient is in `private.moderators` now, `user_eligible`, not being deleted, and the row is under 24 hours old. No membership test and no mute apply. The first branch excludes the kind: it joins the list `o.kind not in ('connection_request','connection_accepted','chat_message','announcement')` (plan2.sql:649, chat core's :657).
  - The deletion function (`private.request_account_deletion`), copied from chat core's body (:817-874) inside its `do`/`execute` guard (:814-877); plan 2 does not redefine it (Bases). Its `set_config('resbite.system','deletion',true)` (:837) kept. It also deletes the person's blocks both ways, the reports they filed (CH-P18, G-S11, Decision 7), their `chat_rules_acceptances` rows and their `moderators` row. These sit next to the built `delete from public.connections …` and `delete from private.connection_refusals …` (:853-854). Reports about them stay, with their frozen text. The freeze matters: once an author is gone, `messages_touch` empties their messages whatever way the profile went (:56-72, H42). The built body already deletes the person's own outbox rows (:872), so a moderator's queued `report_filed` goes with them. The local-only `private.activate_deletion_intent` is left to the roadmap's account-deletion item, as chat core left it (its runbook's Known gaps). The added deletes take no chat row, so plan 2's parked gap (ruling GR2: two deletions at once can deadlock when each owns a group stopped by Edit and each wrote in the other's chat; plan2.sql:102-105) is neither fixed nor widened here: its one sorted pass over the chat rows stays with the account-deletion item.
  - `private.fold_web_account(p_from, p_into)` redefined, copied from chat core's body (`chat_core.sql:1000-1091`; plan 2 does not redefine it, Bases), with one step added before "4. The web profile" (challenge I4). Without it the profile's delete cascades the web account's blocks away, and reports keep naming an id that no longer exists:
    - each `private.blocks` row naming `p_from`, as blocker or blocked, is inserted again with `p_into` in its place and its `created_at` kept, `on conflict do nothing`, leaving out a row that would block oneself. The old rows go with the profile (`on delete cascade`);
    - `private.reports` name `p_into` where they named `p_from`: `reporter_id`, `target_user_id` and `frozen_author`.

    Its grants are kept. A connection the app account already had with someone who blocked the web account stays (Known gaps).
  - Ops scripts, plain SQL for the SQL editor (G-S12):
    - `open-reports.sql`, read-only, one result (the SQL editor shows one) with exactly these columns in this order: `item, id, created_at, reason, details, frozen_body, reporter_name, target_name, resbite_title, resbite_date` (G-S14; `item` comes with the challenge's I10 and I11). No phone number or email:
      - `item 'report'`: the open reports, oldest first;
      - `item 'block'`: the blocks made in the last 7 days, newest first. `created_at` is the block's, `reporter_name` the blocker's name and `target_name` the blocked person's. Every other column is null, so no message text (I10, R-Q2, Decision 15);
      - `item 'due'`: one row while closed reports are due, that is closed more than `private.report_keep_days()` days ago, or closed and naming an account with no profile or being deleted. `details` says how many, and to run `purge-closed-reports.sql`. Every other column is null.
    - `close-report.sql`: one `values` row at the top, `(report_id, status, action, note)`. It sets `status`, `action`, `review_note` and `reviewed_at = now()` in one transaction. When the report's target has no profile or is being deleted (`private.deletion_pending`), it also sets `target_user_id` and `frozen_author` null, since the reported id stays only until the report is closed (I11). It prints the updated row.
    - `remove-reported-message.sql`: one literal at the top, the report id. It first locks the message's `public.chats` row (`for update`), as `delete_message`, `remove_message` and the deletion take the chat row before the message (:569-570, H28; challenge N6). It then sets the reported message's `state = 'removed'`, `body = null` and `payload = jsonb_build_object('by','resbite')` while it is a `message` or `announcement` still `sent` (the rows `remove_message` takes, :588-601), and prints the message id and state (CH-R-A3).
      - Chat core's triggers do the rest: `messages_touch` moves `updated_at`, so open screens get it through `chat_messages_since`; `messages_chat_stats` lowers the count and re-pins when it was the pinned announcement; `messages_signal` broadcasts it (:56-72, :389-418, :1093-1111). The push eligibility already drops a message no longer `sent` (:685).
      - `by` is not a person key (`chat_names` reads only `actor`, `user` and `brought_by`, :222-235), and `'resbite'` is not a uuid, so it is never looked up.
      - The report stays open until `close-report.sql` records the action (G-B4(b)).
    - `suspend-account.sql`: one literal at the top, the report id. For the report's target it sets their `private.tester_roster` row's `enabled = false` and revokes their live grant in `private.beta_access`. It prints the two counts. A comment at its end holds the two statements that undo it (the roster row's `enabled = true`, the grant's `revoked_at = null`), for a suspension made in error (challenge N8). The runbook adds the Auth dashboard ban as an owner step.
    - `moderators.sql`: one list of emails at the top. It replaces `private.moderators` with the accounts holding those emails, and prints the count and each email with no account.
    - `blocked-terms.sql`: one list of terms at the top, empty in the repository. It replaces `private.blocked_terms` with the list (lowercased, trimmed, without duplicates) and prints the count, never the terms. The owner pastes the list into the SQL editor's copy only.
    - `purge-closed-reports.sql` (the ruling on I11, R-Q3): nothing to edit, since the period is `private.report_keep_days()`. In one transaction it deletes the reports that are not `open` and whose `reviewed_at` is more than that many days ago. It sets `target_user_id` and `frozen_author` null on closed reports whose target has no profile or is being deleted, which covers a profile deleted by hand after the close. It prints the two counts. No existing purge job fits: `supabase/functions/purge-deletion-receipts` is for deletion receipts, prepared and not enabled.
  - Rollback, `supabase/rollback/20261111160000_chat_safety.rollback.sql`, in this order:
    - lock `private.notification_outbox` and the five tables first, `in access exclusive mode`, as chat core's rollback locks its own (`supabase/rollback/20261111140000_chat_core.rollback.sql:53-54`), so a report filed meanwhile waits instead of aborting the rollback (challenge N6);
    - delete the `report_filed` outbox rows;
    - restore chat core's kind check (its 13 kinds, :380-382), `private.chat_messages` (:284-293), `private.chat_messages_since` (:304-317), `private.my_chat_overview` (:334-364), `private.send_message` (:464-504), `private.send_announcement` (:513-555), `public.claim_notification_deliveries` (:705-773, I-3), `private.fold_web_account` (:1000-1091) and the deletion body (:817-874, inside the same `to_regprocedure` guard, where it exists), each byte for byte as built at sha256 `1047fb37…ce`, written `create or replace` so their grants stay;
    - restore plan 2's `private.chat_summary` (plan2.sql:235-261), `private.request_connection` (:585-636) and `private.notification_recipient_eligible` (:644-684, with its P2-Q1 group rule) as plan 2's migration at sha256 `f7a34398…d28` built them (challenge B2), the connections migration's `plan_connection_states` (`20261110120000_connections.sql:278-294`, `create function` there, so written `create or replace`), the circles migration's `invite_contacts` (`20261111130000_circles_of_trust.sql:301-443`) and the phone_key migration's `contacts_on_resbite` (`20261030130000_phone_key.sql:92-107`, challenge I5);
    - drop `block_user`, `my_blocks`, `report_message`, `report_user` and `accept_chat_rules` in both schemas, and `chat_rules_version`, `report_keep_days`, `invited_by` and `inviter_of`;
    - drop `blocks`, `reports`, `moderators`, `chat_rules_acceptances` and `blocked_terms`. Dropping `private.blocks` is what lets plan 2's rollback run next: its guard refuses while that table exists.
    - Consistency with plan 2 (challenge B2): plan 2's rollback (sha256 `eb1c530b…fb1a`) refuses while `private.blocks` exists ('Run the chat safety rollback before the chat groups rollback', its lines 46-50), then restores chat core's `notification_recipient_eligible`, `chat_summary` and `chat_row`, the creating-a-resbite `can_see_guests`, the follow-ups `request_connection` and the circles roll, so the two rollbacks in turn land on chat core's bodies. Chat core's rollback then restores the circles claim over the chat core claim this file put back. The confirmer checks the chain.

    Its header says what is lost: every block, report, moderator, acceptance and blocked term. It also says to roll back in reverse order only, this plan first, then plan 2's, then plan 1's (G-N11). The full order and guarded chain are chat core's: chat 3 → chat 2 → chat 1 → circles → follow-ups, then connections and creating-a-resbite, which have no guard (`supabase/rollback/20261111140000_chat_core.rollback.sql:34-42`). A message the team removed keeps `payload {by: 'resbite'}`, and a build without plan 3 words it as "Message removed by an admin".

- [ ] **Step 1: Failing SQL test, slice 2.** Slice 2's cast is slice 1's, plus 09 (Going on the one-off) and 17, the moderators-to-be (neither is in `private.moderators` until a line below puts them there), 10, 14 (a web account: no app use, owns nothing), 15 (an app account) and 16 (a live grant, no roster row). The setup also rolls the group once, so it has a previous occurrence (confirmation NOTE 1): a message by 03 is inserted by hand on the group's first occurrence (`plan_id` that occurrence, dated an hour back), the first occurrence is moved into the past under the roll's flag, and `private.roll_repeating_plans()` runs as postgres, as `chat.sql:318-321` does. Plan 2's roll keeps 04's Going row on the first occurrence and carries 04, pending, to the second, now the current one. Each ops script is read as text through `:resbite_repo` (a backtick `cat`, as `20261030130000_phone_key.after.sql:91` and `chat.sql:2270-2274` do), with its top literal swapped by `sed`, and run as postgres.
```sql
-- Rules: 03 sends before accept_chat_rules: 22023 'Rules not accepted'. 02 announces before accepting: the same.
--   accept_chat_rules as 03, twice: one row, version '2026-11'. chat_summary.rules_accepted for 03 true, for 05 false.
--   Then 03 sends: ok. After these assertions, the slice's other senders (02, 04, 05, 10) accept the rules before they send (SHOULD 3).
-- Blocked terms: insert 'zzbadword'. 'this has ZZBADWORD in it': 22023 'Not allowed'. 'zzbadwords': sent.
--   An announcement holding it: 'Not allowed'. Inserting 'a.b': check_violation.
--   N4: inserting '@ss' or 'two  spaces': check_violation. With 'zz bad' listed, 'it was zz' || E'\n' || 'bad' and
--   'zz   bad' are 22023 'Not allowed'.
-- report_message by 05 on 04's message: a row with frozen_body, frozen_author 04, target 04. 04 deletes it: the report is unchanged.
--   The same report again: success, still one row, no second report_filed row.
--   08 (stranger): 22023 'Report unavailable'. 05 on a system line, on a deleted message, on its own message: the same error.
--   04 leaves the group (plan 2's leave_series, which deletes 04's row on the current occurrence, not yet ended). 04
--   reports a message written on the current occurrence before leaving (by hand, an hour back): a row (left after it).
--   04 reports 03's message from the previous occurrence (the setup's), where 04's row stays: a row.
--   06 (pending on the one-off) reports 02's 'everyone' announcement: a row.
--   NOTE 15: 06 reports 04's plain message on the one-off: 22023 'Report unavailable' (a pending row there is not enough).
--   After the chat closes: 05 reports another message of 04's: a row.
-- report_user by 05 about 04 on the series: a row whose plan_id is the latest occurrence they share. About 08: 'Report unavailable'.
--   NOTE 8: the same report again while open: success, still one row, no second report_filed row.
--   After close-report.sql closes it: a new report stores a row.
--   S5: 10 writes in the one-off's chat, then 01 removes 10. report_user by 05 about 10 on the one-off's series: a row,
--   whose plan_id is the one-off.
--   Reasons outside the four: check_violation. Details of 501 characters: check_violation.
-- N14 (d): 05 blocks 04, then reports 04's message by its id: a row. On the group, after its chat closed (stopped,
--   48 hours moved by hand): 05 reports a message there: a row.
-- R-Q1: 06 (pending on the one-off, so no can_see_guests) reports 01, its owner, with report_user on the one-off's
--   series: a row whose plan_id is the one-off. 06 reports 02, whose 'everyone' announcement reaches 06: a row.
--   11 (pending on the third plan, brought by 03) reports 03 on that series: a row. 12 reports 03 there:
--   22023 'Report unavailable'.
-- I3: 07 asks 05 to connect on the one-off's series, then 01 removes 05: report_user as 05 about 07 on that series:
--   a row (the waiting request admits it).
-- N5: 05 reports 04's message and, by report_user, 04 on the same series; that message row is deleted by hand: the
--   delete succeeds and both reports stay, about 'message' and 'user'.
-- I7, the limit, in a savepoint (NOTE 1): 05's reports topped up by hand to exactly 20 created in the last 24 hours
--   (20 less the number 05 already filed above), and one more 25 hours old. report_message as 05: 22023 'Report limit',
--   no row, no report_filed row. report_user as 05: the same. Move one of the 20 back 25 hours: report_message as 05
--   stores a row. Roll back to the savepoint, so 05's later reports (I4, the moderator lines) stay under the limit.
-- I4: 03 blocks 14 (Going on the one-off). 05 reports 14 with report_user, and reports 14's message (inserted by hand).
--   fold_web_account(14, 15): a block row (03, 15) and none naming 14; the user report's target_user_id is 15, and the
--   message report's frozen_author and target_user_id are 15.
-- I11 (CH-P18): in a savepoint, 05's profile deleted by hand: every report 05 filed is gone (on delete cascade), and
--   a report about 05 filed by 03 stays with frozen_body, target_user_id 05 and frozen_author 05. A report about 16
--   keeps target_user_id 16 after 16's profile is deleted by hand (in a savepoint); close-report.sql on it:
--   target_user_id and frozen_author null.
-- Moderator push: 09 put in private.moderators. A report by 05 queues one report_filed row to 09, dedupe
--   'report:<id>:09', eligible.
-- I-4 (each exclusion can fail): 17 put in private.moderators too, then every report_filed row set to
--   created_at = now() - interval '11 minutes'. A report by 09 (of a message of 04's on the one-off) queues one row,
--   to 17, and none to 09 (the reporter, G-B4(c)). Every report_filed row moved back 11 minutes again. N8: a report by
--   05 about 09 (report_user on the one-off's series) queues one row, to 17, and none to 09 (the target).
--   N14 (a): 09 is also a Going guest of the reported resbite and has muted it: the queued row is eligible (no mute
--   applies to report_filed). 09 unmutes, and moderators.sql leaves 09 out: the row is not eligible (the first branch
--   leaves the kind out, so 09's guest row doesn't make it eligible).
-- I7, coalescing: 09 and 17 in private.moderators. Every report_filed row moved back 11 minutes, then one to 09
--   created 5 minutes ago (by hand). A report by 05 queues one report_filed row, to 17. Move every report_filed row to
--   09 back 11 minutes (I-4: all of them, not only the hand-made one): the next report by 05 queues one to 09, and none
--   to 17, whose row is from this transaction.
-- I7, priority: 150 chat_message rows queued before a report_filed row, and a device for 09: one
--   public.claim_notification_deliveries(25) returns 09's report_filed job (as chat.sql's crowd test, :1454).
-- Deletion (guarded): 03's blocks both ways are gone. 05's deletion deletes 05's reports (CH-P18).
--   Reports about 04 stay after 04's deletion, with frozen_body. 03's acceptance row and 09's moderators row go with their deletions.
-- open-reports.sql, run as 'create temporary table … as <script>': its column names, in order, are exactly
--   item, id, created_at, reason, details, frozen_body, reporter_name, target_name, resbite_title, resbite_date.
--   Its 'report' rows are the open reports, oldest first. 03's block of 04 is a 'block' row with 03's name as
--   reporter_name and 04's as target_name, details and frozen_body null; a block moved back 8 days is not listed.
--   With a report closed 181 days ago (reviewed_at moved by hand): one 'due' row. Without one: none.
-- close-report.sql with (report_id, 'actioned', 'both', 'Removed and suspended'): status, action, review_note and reviewed_at set.
-- remove-reported-message.sql on 05's report: the message reads state removed, body null, payload {"by": "resbite"}.
--   chat_messages as 05 returns that payload, and its names map has no 'resbite' key. A second run changes nothing.
-- S6 needs no assertion here: plan 1's chat-send-concurrency.sh passes in full mode with its guarded acceptance.
-- suspend-account.sql on a report about 04: user_eligible(04) false. On a report about 16 (a live grant, no roster
--   row): user_eligible(16) false (N14 (b)).
-- purge-closed-reports.sql: a report closed 181 days ago goes; one closed 179 days ago and an open one stay; a closed
--   report naming a profile deleted by hand stays with target_user_id and frozen_author null. It prints 1 and 1.
-- moderators.sql with one email: one row. blocked-terms.sql with two terms: two rows. With the empty list: none.
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** section 2, the seven scripts and the rollback. Add the rules acceptance, a `do` block with `execute` behind the `to_regclass` guard, to the setups of `chat.sql`, `chat-groups.sql` and `chat-send-concurrency.sh`. In `chat-safety.sql`, slice 1's setup already has it, and slice 2 adds it after its rules assertions. In `chat.sql`, `:227-229`'s key list gains `rules_accepted` in sorted order, between `repeat_weeks` and `series_id` (confirmation I-1).
  - In `chat.sql`, each of its transactions writes in its own setup: slices 1 and 2 share the c1 cast (`pg_temp.c1_cast()`, a `language sql` function, so the guarded block follows its call at :154 and :1690), slice 3 has the c1 cast again with c3 people, the way-back block has c6 and the deletion block c5 (`chat.sql:7-9`). The way-back block (`chat.sql:2256-2292`, built by plan 2) only runs chat core's rollback to see it refuse once plan 2 is applied; plan 3 applied changes nothing there.
  - In `chat-groups.sql`, `pg_temp.e6_cast()` (:88-118) is `plpgsql` and every one of its nine blocks runs it first, so the guarded acceptance goes at its end: when `to_regclass('private.chat_rules_acceptances')` is not null, `execute` an insert of `(id, private.chat_rules_version())` for the cast's twelve profiles, `on conflict do nothing`.
  - `chat-send-concurrency.sh`'s writers have the prefix `e9` (`supabase/tests/local/chat-send-concurrency.sh:30-45`).
  - Chat core's and plan 2's hosted-baseline `after.sql` files run before this migration in that mode, so they need none.
- [ ] **Step 4: Rehearsal files.** `before.sql` asserts none of the five tables exists. `after.sql` asserts:
  - the five tables exist with RLS on, no policies and no grants;
  - `blocked_terms` and `moderators` are empty (the migration seeds nothing);
  - `block_user`, `my_blocks`, `report_message`, `report_user` and `accept_chat_rules` are executable by `authenticated` only, and `invited_by`, `inviter_of`, `chat_rules_version` and `report_keep_days` by no API role;
  - the kind check admits `report_filed`;
  - inside a transaction that ends in `rollback`, as `20261110120000_connections.after.sql` does, the rollback restores each previous body exactly (`pg_get_functiondef`), leaves none of the five tables, and leaves no `report_filed` outbox row. Chat core wrote most of its bodies with `create function`, so the comparison runs chat core's statement as `create or replace` and checks nothing changed. It cuts the statement from the file as `pg_temp.ch_source` does (`chat.sql:131-138`). The deletion body, `fold_web_account` and the claim are `create or replace` there already. Plan 2's bodies (`chat_summary`, `request_connection`, `notification_recipient_eligible`) are compared with plan 2's file, `plan_connection_states` with the connections file (run as `create or replace`), `invite_contacts` with the circles file and `contacts_on_resbite` with the phone_key file, every one of the fourteen in the Bases table, each also with its grants (`proacl`) as before;
  - with the rollback run, plan 2's rollback passes its guard (no `private.blocks`).
- [ ] **Step 5: Run** every test file in both modes → PASS. The hosted-baseline mode names all five candidates, in order: follow-ups, circles, chat core, chat groups and this migration (the command in `qa/chat-release/README.md:110`, which names three at `333747d`; plan 2's runbook names four, 27 PASS). Before that run, `sha256sum` each base file in the Bases table again: each must print its hash, or stop and ask. Record `sha256sum` of the migration and the rollback.
- [ ] **Step 6: Commit:** `"Safety: reports, moderators, chat rules and blocked terms, and the team's scripts"`

### Task 3: The sender: the moderators' push

**Files:**
- Modify: `supabase/functions/_shared/notification-copy.ts` (`notificationCopy`), `notification-copy.test.ts`, `notification-engine.ts` (`dataFor`, inside `payloadFor`), `notification-engine.test.ts`; `mobile/src/services/pushRegistration.ts` (`PUSH_TYPES`) and `pushRegistration.test.ts`, `mobile/src/services/pushDevice.test.ts` (sign-out's dismissal), `mobile/src/services/pushTaps.test.ts` (`isPlanUpdateTap`, a guard test only) and plan 1's `mobile/src/domain/reminders.ts` (`showsInForeground`) with its test

**Interfaces:**
- Consumes: Task 2's `report_filed` outbox rows, claimed as every other kind is, and before the chat kinds (`chat_core.sql:712`, :743). The claim gives them `title`, `actor_name` null and no chat fields (:750-763).
- Produces:
  - `notificationCopy({ kind: "report_filed", … })` (`notification-copy.ts:167-203`) → `{ title: "Resbite", body: "A new report is waiting." }`, whatever else the row carries. No resbite title, name or text of the report. Today an unknown kind falls through to `GENERIC_COPY` ("Resbite" / "You have an update. Open Resbite to see it.", :23-26 and :201-202), so the new branch goes before that fall-through.
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
- Modify: `mobile/src/domain/eventPage.ts` and test (`PersonAction`, `PersonRow.blocked`, `peopleGroups`, `MoreRow`'s `reportOrBlock`), plan 1's `mobile/src/domain/chatCopy.ts` and `chatRules.ts` with their tests (`removedByResbite` in `words`, hence `messageLabel` and `rowText`; `cleanName` exported for Blocked people), plan 1's `mobile/src/state/chatFeed.ts` and test (`wordsOf` for the bubble and the card; `MessageAction` and `messageActions` gain `report`), `mobile/src/services/chat.ts` and test (`ChatSummary.rulesAccepted`, `ChatOverview.inviters`, `chatErrorMessage`, `needsChatRules`), `mobile/src/services/connections.ts` and test (`connectionErrorMessage` words `'Unblock first'`, confirmation NOTE 5), `mobile/package.json` (`test` chain)
- Modify, because the two new required fields break them (the app's side of confirmation I-1): the typed `ChatSummary` fixtures gain `rulesAccepted: true` (`state/chatModel.test.ts:52`, `domain/chatRules.test.ts:68`, `state/chatSession.test.ts:85` `baseSummary`, `domain/eventPage.test.ts:1153` `chat`); `services/chat.test.ts`'s summary `deepEqual` (:78) gains `rulesAccepted: false` (its answer has no `rules_accepted`), and its overview `deepEqual`s (:243-250, :252, :253) gain `inviters: {}`; `domain/chatRules.test.ts:805-809`'s overview literal gains `inviters: {}`.
- **After plan 2's Task 4** (Sequencing): it changes `chatRules.ts` and its test.

**Interfaces:**
- Consumes, as chat core built them and plan 2 left them at `333747d`:
  - `CHAT_COPY` (`chatCopy.ts:14-144`; `removed` :40, `cancel` :30, `keep` :45, `someone` :63);
  - in `chatRules.ts`: `words(m)` (:278-283, behind `rowText` :289-299 and `messageLabel` :504-531) and `cleanName` (:132, private);
  - in `chatFeed.ts`: `wordsOf` and `goneOf` (:120-121), `messageActions(m, viewerId, host)` (:114-118) and `MessageAction` (:11, whose comment at :9 says "Plan 3 appends Report");
  - `ChatSummary` with its mapper `summary()` (`chat.ts:38-72`, :176-206), the refusal helpers (:263-274, `isTooFast` the pattern) and `chatErrorMessage` (:277-295, falling back to `INVITE_COPY.offline` at :294; plan 2 added the leave words at :284-287);
  - `ChatOverview.announcements[planId] = { id, authorId, body }` (`chat.ts:75-80`) and its mapper `overview()` (:208-227);
  - `chat.replace()` (`useChat.ts:35-36` over `chatSession.ts:836-842`: it re-reads the summary and the newest page and replaces the list, earlier pages and all; H25 Q3, built for this plan);
  - in `eventPage.ts`: `peopleGroups` (:570), whose `connections` input is null while unknown (:579, read by `connectionOf` :596-597), and `moreRows(i)` (:297-318) with plan 2's `isGroup`, `chatOpen` and `leaveGroup` (plan 2's Task 3);
  - in `services/connections.ts`: `connectionErrorMessage` (:91-99), whose 22023 branch (:97) answers `CONNECTIONS_COPY.failed`;
  - a source check's pattern: `contactInvites.test.ts:271` reads a file as text and asserts what it doesn't hold.
- Produces:
  - `SAFETY_COPY` (exact). The apostrophe is ’ (U+2019), as in chat core's copy (`chatCopy.ts:52`, :57, :60; H37 Q7):
    - the report sheet: `report: "Report"`, `reportMessage: "Report message"`, `reportPerson: (name) => \`Report ${name}\``, `reportOrBlock: "Report or block"`, `why: "What’s wrong?"`, `reasons: { harassment: "Harassment", spam: "Spam", inappropriate: "Not appropriate", other: "Something else" }`, `detailsLabel: "Anything else? (optional)"`, `sendReport: "Send report"`, `pickReason: "Pick a reason to send the report."`, `thanks: "Thanks. The Resbite team will look at it."`;
    - block and unblock: `block: (name) => \`Block ${name}\``, `unblock: (name) => \`Unblock ${name}\``, `blocked: "Blocked"`, and `blockQuestion(name, youHost, theyHost)` (G-N9, the person's name, never a pronoun):
      - `youHost` true: \`Block ${name}? You won’t see ${name}’s messages or announcements, and you won’t be able to remove ${name}’s messages. Any connection between you ends, and unblocking won’t bring it back.\`;
      - `theyHost` true only: \`Block ${name}? You won’t see ${name}’s messages or announcements, and ${name} won’t know. Any connection between you ends, and unblocking won’t bring it back.\`;
      - neither: \`Block ${name}? You won’t see ${name}’s messages, and ${name} won’t know. Any connection between you ends, and unblocking won’t bring it back.\`;
      - the last sentence says what a block does to a connection, and that Unblock doesn't undo it (challenge N9; G-B1);
    - errors: `unavailable: "You can’t report that any more."`, `unblockFirst: "Unblock this person first."`, `notAllowed: "That message can’t be sent."` (G-B4(a)), `reportLimit: "You’ve sent a lot of reports today. Try again later."` (challenge I7);
    - the chat rules (G-B4(d)): `rulesTitle: "Chat rules"`, `rules: "Be kind. No harassment, hate, threats or spam. Messages that break these rules are removed, and people who break them can lose their account."`, `agree: "I agree"`;
    - a rules refusal and a failed I agree (challenge I6), each its own line, none "Check your connection": `rulesFirst: "Agree to the chat rules first."` (the words for `'Rules not accepted'`), `rulesHeldMessage: (n) => n === 1 ? "Your message hasn’t been sent. Agree to the chat rules to send it." : \`${n} messages haven’t been sent. Agree to the chat rules to send them.\``, `rulesHeldAnnouncement: "Your announcement hasn’t been sent. Agree to the chat rules to send it."`, `rulesNotSaved: "That didn’t go through, so nothing was sent. Try again."`;
    - blocked people (G-S10): `blockedPeople: "Blocked people"`, `noneBlocked: "You haven’t blocked anyone."`;
    - contact (G-N10): `contact: (address) => \`Questions, or something wrong in a chat? Write to ${address}.\``, `copyAddress: "Copy address"`, `copied: "Copied"`;
    - reports on Data & privacy (G-S11, challenges N9 and I11): `reportsPrivacy: "If you report a message or a person, the Resbite team reads the report and keeps a copy of what was reported, even if the message or that person’s account is deleted. If you delete your account, the reports you sent are deleted too. A report is deleted 180 days after the team closes it."`. It names a person as well as a message, says what happens to the reporter's own reports (CH-P18), and gives the period (R-Q3).
  - `supportAddress(env: string | undefined): string | null`: trimmed; null when empty, or when it isn't an address (one `@` with text before it, a dot in the part after it, and no blank), so a broken `mailto:` is never shown and the release gate catches the value (challenge N9).
  - `thanksLines(address: string | null): string[]`: `[thanks]`, or `[thanks, contact(address)]` when set (G-N10).
  - `showsReportOrBlock(otherPeople: number): boolean`: false at 0 (G-N7).
  - `ReportTarget = { kind: "message"; id: number } | { kind: "user"; userId: string; series: string; name: string }` (G-N6).
  - `invitationActions(i: { announcement: { id: number; authorId: string | null } | null; inviterId: string | null; owner: { userId: string; name: string } | null; viewerId: string; names: ChatNames }): InvitationAction[]`, with `InvitationAction = { kind: "reportMessage"; id: number } | { kind: "reportPerson"; userId: string; name: string } | { kind: "block"; userId: string; name: string; theyHost: boolean }`, in `safetyCopy.ts` beside `showsReportOrBlock` (P3-Q1, B4, R-Q1, I-2, Decision 14). The order: Report message when there is an announcement; then for the announcement's author, then the inviter, then the owner (confirmation I-2), each person once (by id, at their first place), Report <name> and Block <name>. The author's and the inviter's names come from `names`; the owner's from `owner.name` (the card and the page pass a first name). The viewer, and a person whose name is null or blank, are never listed. `theyHost` (confirmation NOTE 7, the shorter question): true for the announcement's author (only a host announces) and for the owner, false for an inviter who is neither. The card and the resbite page both draw from it.
  - `createSafetyGateway(rpc, deadline?)` → `{ block(userId), unblock(userId), myBlocks(), reportMessage(id, reason, details?), reportUser(userId, series, reason, details?), acceptRules() }`, in `services/safety.ts`. It is in the shape of `createChatGateway(rpc, deadline = passThrough)` (`chat.ts:230-255`): `Rpc`, `Deadline` and `passThrough` from `./contactInvites`, `planDeadline` for the live one, the client loaded on first use, and a refusal thrown as the server sent it:
    - `block_user` with `{p_user, p_block: true}`, and `{p_user, p_block: false}` for unblock;
    - `my_blocks` mapped to `{ userId, name }[]`;
    - `report_message` with `{p_id, p_reason, p_details}`, `p_details` null when absent;
    - `report_user` with `{p_user, p_series, p_reason, p_details}`;
    - `accept_chat_rules` with `{}`.
  - **The "blocks changed" event** (challenge B3, Decision 17), in `services/safety.ts`, app-wide: `onBlocksChanged(listener: () => void): () => void` adds a listener and returns its removal. The gateway's `block` and `unblock` emit it once after the server answers success, never on a refusal or a failure. Every block and unblock in the app goes through the gateway: no other file calls `block_user`.
  - `safetyErrorMessage(e)`, in `services/safety.ts` beside the gateway, as `chatErrorMessage` is in `services/chat.ts` (confirmation NOTE 9): `'Report unavailable'` → `unavailable`, `'Unblock first'` → `unblockFirst`, `'Report limit'` → `reportLimit` (challenge I7), else `INVITE_COPY.offline` (G-N6), as `chatErrorMessage` falls back (`chat.ts:294`).
  - `connectionErrorMessage` (`services/connections.ts:91-99`) maps `22023 'Unblock first'` → `SAFETY_COPY.unblockFirst` before its 22023 fallback (:97), since a Connect from a stale `blocks` set (another phone blocked) reaches `request_connection` through it, never through `safetyErrorMessage` (confirmation NOTE 5). Any other 22023 keeps `CONNECTIONS_COPY.failed`.
  - `ChatSummary` gains `rulesAccepted: boolean`, read by `summary()` as `data.rules_accepted === true`, as the built mapper reads every flag (`chat.ts:188-203`). `chatErrorMessage`'s 22023 branch (:289-293) maps `'Not allowed'` → `SAFETY_COPY.notAllowed` and `'Rules not accepted'` → `SAFETY_COPY.rulesFirst` (challenge I6). `needsChatRules(e)` is true for `22023 'Rules not accepted'`, written like `isTooFast` (:274) with the built `refusal` helper (:263-264).
  - `ChatOverview` gains `inviters: Record<string, string>` (plan id → user id), read by the overview mapper (:208-227) from `inviters`, and `{}` when the answer has none (challenge B4).
  - Blocked people's names (Task 6) are cleaned by `cleanName` (`chatRules.ts:132`, exported for it), the cleaning every name in a chat gets (`nameOf`, :135-136), with "Someone" for null. Chat core's note asks this plan to choose between `oneLine` and `cleanText` for a name or a preview. `oneLine` (:127-130) keeps zero-width and directional marks that `cleanText` (:116-119) removes. A name reads as the chat reads it, and this plan shows no report preview.
  - `PersonAction` gains `report`, `block` and `unblock`. `PersonRow` gains `blocked: boolean`. `peopleGroups(i)` takes `blocks: ReadonlySet<string> | null`:
    - every row with a `userId` other than the viewer's gets `report`, then `block`, or `unblock` when the person is in `blocks`;
    - `request` rows get `block` or `unblock` only, never `report` (G-S9);
    - a blocked person's row has no connection actions and `blocked: true`, which shows the badge to the blocker only;
    - `blocks` null means not known yet (the `my_blocks` read failed or hasn't landed), as a null `connections` does (:579, :596-597): no row gets `block`, `unblock` or `connect`, and `report` stays (challenge N13).
  - `MoreRow` (`eventPage.ts:289`) gains `"reportOrBlock"` (B1, B4). `moreRows` gives it to a guest whose `response` is `pending`, while the page is open (`state === "open"`, :307), with or without an announcement, before plan 2's `leaveGroup`, which stays last (:317). On an ended or cancelled page a group's guest keeps only `leaveGroup`, as plan 2 built it.
  - No `afterBlockChange`: chat core built the reload as `chat.replace()` (G-S8), already tested in `chatSession.test.ts` (:1593). Task 5's sessions call it on the "blocks changed" event (B3), and the cached list goes, older pages included.
  - `MessageAction` (`chatFeed.ts:11`) gains `"report"`. `messageActions` (:114-118) offers it, after Delete or Remove, on someone else's `message` or `announcement` in state `sent`, whether or not the reader hosts. Rows with no author and system lines get none (G-N12).
  - `CHAT_COPY.removedByResbite: "Message removed by Resbite"` (CH-R-A3). A row with `state = 'removed'` and `payload.by = 'resbite'` uses it. Chat core words a removed row in two places, so both change:
    - `words(m)` (`chatRules.ts:278-283`), for `messageLabel` and `rowText`;
    - `wordsOf(m)` (`chatFeed.ts:121`), for the bubble and the announcement card.

    Every other removed row keeps plan 1's `removed`, "Message removed by an admin".

- [ ] **Step 1: Failing tests:**
  - every string, exactly, with the three block questions for "Ana", and `rulesHeldMessage(1)` and `rulesHeldMessage(3)`;
  - each gateway call and its arguments;
  - B3: `block` and `unblock` each emit one "blocks changed" event when the server answers success, and none on a refusal or a failure; the function `onBlocksChanged` returns stops it. A source check: no file under `mobile/app` or `mobile/src` but `services/safety.ts` and the tests names `"block_user"`, so the card's, the page's, Connections' and Blocked people's blocks all emit;
  - `safetyErrorMessage` for its three errors and its fallback; `chatErrorMessage` for `'Not allowed'` and for `'Rules not accepted'` ("Agree to the chat rules first."); `needsChatRules`; `connectionErrorMessage({ code: "22023", message: "Unblock first" })` → "Unblock this person first.", and another 22023 still → `CONNECTIONS_COPY.failed` (NOTE 5);
  - `summary()` reads `rules_accepted: true` as `rulesAccepted: true`, and an answer without it as false;
  - `supportAddress(undefined)` and `supportAddress("  ")` give null; `supportAddress(" help@x.example ")` gives `"help@x.example"`; `supportAddress("help")` and `supportAddress("a b@x.example")` give null;
  - `invitationActions`, Ana the owner in each unless it says otherwise: Ana's announcement with Ana the inviter gives Report message, Report Ana, Block Ana (once, `theyHost` true); Ana's announcement with Pedro the inviter gives Report message, Report Ana, Block Ana, Report Pedro, Block Pedro (Pedro's `theyHost` false); I-2: no announcement with Pedro the inviter gives Report Pedro, Block Pedro (`theyHost` false), Report Ana, Block Ana (`theyHost` true); no announcement, no inviter, Ana the owner gives Report Ana, Block Ana; Ada's announcement (an admin), Pedro the inviter, Ana the owner gives Report message, then Ada, Pedro and Ana in that order, Ada's and Ana's `theyHost` true; the viewer as inviter or as owner, a null name in `names` and an owner with a blank name are left out;
  - the overview mapper reads `inviters`, and an answer without it gives `{}`;
  - `moreRows`: a pending guest of a one-off gets `["reportOrBlock"]`; of a group with the chat open, `["reportOrBlock", "leaveGroup"]`; an answered guest gets no `reportOrBlock`;
  - `thanksLines(null)` gives one line; `thanksLines("help@x.example")` gives the thanks and "Questions, or something wrong in a chat? Write to help@x.example.";
  - `showsReportOrBlock(0)` false, `showsReportOrBlock(1)` true;
  - `peopleGroups`: every other row gets `report` and `block`; `unblock` instead of `block` for a person in `blocks`; a `request` row gets `block` and no `report`; a blocked row has no `connect` and `blocked: true`; the viewer's own row has none of them; with `blocks` null, no row has `block`, `unblock` or `connect`, and every other row keeps `report`;
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
- Modify: `mobile/app/chat.tsx` (long-press "Report message"; a tap on an author's name opens their sheet; the menu's "Report or block"; the rules sheet before a first send and after a refusal), `mobile/src/state/chatSession.ts` and test (`rulesNeeded`, `agreeRules` and `dismissRules`; the "blocks changed" event calls `replace()`), `mobile/src/state/useChat.ts` (passes the session `acceptRules` and `onBlocksChanged`, and exposes what the session adds; `replace` is already there), `mobile/app/guests.tsx` (Report, Block and Unblock in the person's sheet; `ACTION_ICON` :40; a `"report"` sheet view), `mobile/src/state/useEvent.ts` (reads `my_blocks` beside the connection states, null until it lands; gives an unanswered invitee the overview entry, the inviter and the owner; hears "blocks changed"), `mobile/app/event.tsx` (an unanswered invitee's "Report or block", beside the announcement line and in More), `mobile/app/connections.tsx` (Report and Block on a request card, Block on a connection row), `mobile/scripts/verify-chat.mjs` (the shared summary fixture, `verify-chat.mjs:228-249`, gains `rules_accepted: true`), `mobile/scripts/verify-event.mjs`, `mobile/scripts/verify-connections.mjs`, `mobile/app/(tabs)/plans.tsx` and `mobile/src/design/kit.tsx` (`CoverCard`, :315, gains `onLongPress?` and its `accessibilityActions`), `mobile/scripts/review-ui.mjs`
- **After plan 2's Task 4** (Sequencing). This task changes `mobile/app/chat.tsx`, `mobile/app/event.tsx` and `mobile/app/(tabs)/plans.tsx`, and also `useEvent.ts`, `verify-chat.mjs`, `verify-event.mjs`, `verify-connections.mjs` and `review-ui.mjs`, all of which plan 2's Task 4 changes. Its page entry relies on what that task adds: a More button beside the answer control whenever More has a row (`row.kind === "answer"` with `hasMore`, `event.tsx` at `93aa1da`), which at `333747d` a pending invitee's answer bar doesn't have. Plan 2's Task 4 also gives a group's pending card the series' unread dot (`plans.tsx`) and the event page Leave group; this task keeps both.

**Interfaces:**
- Consumes: Task 4; `useEvent` for the current occurrence's people (G-N6); plan 1's `my_chat_overview` entries with their `id` (confirmation S7), read on My resbites by `chatGateway.overview()` (`plans.tsx:105-111`) and shown through `pendingCardNote` (`chatRules.ts:328-337`) on the invitation cards (`plans.tsx:303-320`, whose byline `INVITE_COPY.invitedYou(host)` at :317 names the owner from `hosts[p.owner_id]`, :304, a display name); the chat screen as chat core built it and plan 2 left it at `333747d`: the menu sheet (`chat.tsx:625-651`), the long-press action sheet (:653-702, `ACTION_LABEL` :72, every action drawn red with `Trash2` today, :662), its focus cleanup (:161-172), "People in this chat", which pushes `/guests` over the chat and leaves it mounted (:634-641), `actionsOf` (:782-786), and `chat.replace()` and `chat.retry(clientId)` (`useChat.ts`); the session's send failure (`chatSession.ts:703-713`), `announce` with its kept client id (:913-937) and `setMute` (:951); the resbite page's announcement line (`event.tsx:390-391`), drawn from `useEvent`'s `readAnnouncement` (`useEvent.ts:204-212`, a string today, read for an unanswered invitee at :277-279), its byline "Hosted by" (`byline(organizer)`, `event.tsx:365`, with `organizer` from `event.organizer`, :148), its `moreRows` call (:168-176) and its More sheet (:428-466); `useEvent`'s connection states (:175, read at :258-260); Connections' request cards (`connections.tsx:84-123`), its connection rows with their ••• sheet, and `useConnections`' `load`.
- Produces:
  - `ReportSheet({ target, onDone })`, with `target` a `ReportTarget`:
    - the four reasons as a radio group (`accessibilityRole="radio"`, `accessibilityState={{ checked }}`);
    - the optional field with `maxLength={500}`;
    - Send report stays disabled until a reason is picked, with `pickReason` as its hint;
    - on success, `thanksLines(supportAddress(...))` in place, announced with `AccessibilityInfo.announceForAccessibility`;
    - on failure the sheet stays open with the typed text and the line from `safetyErrorMessage`;
    - at Larger Text the sheet scrolls with the keyboard open (G-N7);
    - the reporter keeps using the chat.
  - `ChatRulesSheet({ onAgree, onCancel, held, error })`: `rulesTitle`, the `held` line when the sheet follows a refusal, `rules`, the `error` line, a primary `agree` and `CHAT_COPY.cancel`.
  - **The chat's people** come from `useEvent(summary.planId)` for the current occurrence: its guests, connection states and `my_blocks` (G-N6). `my_blocks` is null until its read lands, and a failed read keeps what was known, as the connection states do (N13). The menu's "Report or block" lists them, blocked people with Unblock. The entry is hidden when `showsReportOrBlock` is false. On a group the current occurrence's guests are every member, answered or not (plan 2).
  - **`useEvent` after a block or unblock** (confirmation NOTE 2): while mounted it subscribes to `onBlocksChanged` and, on each event, reads `my_blocks` again, the connection states again when it reads them at all (the block ended any connection, and after Unblock the server answers `none`, not `connected`), and, for an unanswered invitee, the overview again (so the announcement line and the inviter go). The people list in `/guests`, the chat's people and the resbite page all follow from it, whichever screen made the block.
  - **A tap on an author's name** opens that person's sheet. An author no longer on the current occurrence (left or removed) gets a sheet with Report and Block only, named from the `names` map.
  - **Long-press** offers Report message only on someone else's `message` or `announcement` in state `sent` (G-N12): the `"report"` action from `messageActions` (Task 4), also an `accessibilityActions` entry through the built `actionsOf` (`chat.tsx:782-786`). In the action sheet it is not red and has no bin icon, and it opens the `ReportSheet` rather than the in-place delete or remove question.
  - **A removed row** reads "Message removed by Resbite" when its payload says so (CH-R-A3, Task 4).
  - **The invitation card** (confirmation S7, P3-Q1, B4, R-Q1, I-2). On My resbites, a long-press on any pending invitee's card, with or without an announcement, offers `invitationActions` (Task 4) from the overview's entry for the plan, `inviters[planId]`, `names` and the owner, `{ userId: p.owner_id, name: firstName(hosts[p.owner_id]) }` (the person the byline names; `firstName` from `domain/circle.ts`):
    - "Report message" opens the `ReportSheet` with `{kind: "message", id: <overview entry id>}`;
    - "Report <name>" opens it with `{kind: "user", userId, series: <the plan's series>, name}`;
    - "Block <name>" asks `blockQuestion(name, false, action.theyHost)` in place (`theyHost` from `invitationActions`, NOTE 7).

    The same entries are `accessibilityActions` on the card. After a block the overview is read again, and the line and the announcer's and inviter's entries go (the overview leaves out people the caller blocked). The owner comes from the plan, not the overview, so after "Block Ana" the card still offers Ana; blocking again stores nothing new and says so as before (Known gaps). My resbites reads no `my_blocks` for this.
  - **The resbite page of an unanswered invitee** (P3-Q1, B1, B4, I-2). `useEvent` gives `announcement: { id, authorId, name, text } | null` (the overview entry, with `text` as `pendingCardNote` words it) in place of today's string, and `inviter: { userId, name } | null` from `inviters`, both from the one overview read, and the owner, `{ userId: plan.owner_id, name: firstName(organizer) }`, from the page's own read, so a failed overview read still leaves the owner to offer. Two ways in, both opening the same `invitationActions` in the More sheet:
    - beside the line, a "Report or block" text action (`reportOrBlock`), a button of at least 44 pt with that label. A long-press on body text is not a control anyone finds;
    - More's `reportOrBlock` row (Task 4), shown with or without an announcement, through the More button beside the answer control (plan 2's Task 4).

    After a block the overview is read again (the "blocks changed" event, NOTE 2), and the line goes. The started, unanswered tile keeps its cut line and opens this page.
  - **Connections** (challenge I3). A request card gains a ••• button (labelled with the person's name) opening "Report <name>" (`{kind: "user", userId, series: <the request's seriesId>, name}`, left out when `seriesId` is null) and "Block <name>". A connection row's ••• sheet gains "Block <name>" after Remove connection. A connection row has no Report: the ruling gives Report to request cards only. Block asks `blockQuestion(name, false, false)` in place. After it the sheet closes and the list is read again (`load`).
  - Every one of these blocks, and every unblock, goes through the safety gateway, so the "blocks changed" event follows it (B3).
  - **The block confirm** reads `blockQuestion(name, youHost, theyHost)`. After a block from an author's name, focus moves to the sheet's result line, `blocked` (G-N7).
  - **After a successful block or unblock, anywhere** (challenge B3, Decision 17). `ChatSessionDeps` gains `blocksChanged?(listener: () => void): () => void`. The session subscribes when it is made and unsubscribes in `dispose()`. Each event calls `replace()`, which reads the summary and the newest page with `chat_messages` and replaces the list, earlier pages and all (G-S8). It runs while the chat is blurred under another screen, since `replace()` needs only a live session (`chatSession.ts:212`). `useChat` passes `onBlocksChanged` from `services/safety.ts`. No screen calls `chat.replace()` after a block itself, so a block in the chat runs it once. A block keeps the chat on screen, so `focusedChat` stays right. Any path that hides the chat without leaving its screen clears it with `setFocusedChat(null)`; leaving the screen already does (`chat.tsx:161-170`, H36).
  - **The chat rules in the session** (G-B4(d), challenge I6). `ChatState` gains `rulesNeeded: { clientIds: string[]; announce: { body: string; audience: ChatAudience } | null } | null`, null in `IDLE`:
    - a send or a retry refused with `needsChatRules` stays failed with its own client id, as every refusal does (:703-713), and its client id joins `rulesNeeded.clientIds` once. No action error is raised, so no "Check your connection" line shows;
    - an announcement refused with `needsChatRules` puts its body and audience in `rulesNeeded.announce`, and the session keeps its client id for the same words as built (:922-924). No action error is raised either;
    - `ChatSessionDeps` gains `acceptRules(): Promise<void>` (the safety gateway's, passed by `useChat`);
    - `agreeRules(): Promise<boolean>` calls `acceptRules()` once. On success the session's `summary.rulesAccepted` turns true, as `setMute` sets `mutedChat` (:951). Each held client id is then sent once with `retry(clientId)`, in queue order, and a held announcement with `announce(body, audience)`, which reuses its client id. `rulesNeeded` goes, and the answer is true. On any failure nothing is sent, `rulesNeeded` stays, and the answer is false;
    - `dismissRules()` drops `rulesNeeded`. The held messages keep "Not sent. Tap to retry.", their built failed state. A failed message is never resent by itself, whatever its age (H41 I2b), so nothing goes out before I agree.
  - **The chat rules on screen** (G-B4(d), I6):
    - with `summary.rulesAccepted` false, Send and Send announcement open the rules sheet first and call nothing. I agree calls `chat.agreeRules()`, then on true `chat.send(body)` (or `chat.announce(body, audience)`), whose client id the session makes. Cancel leaves the words in the field;
    - `chat.rulesNeeded` not null opens the rules sheet over everything, with `held` from `rulesHeldAnnouncement` or `rulesHeldMessage(clientIds.length)`. The Announce sheet closes into it, keeping its words and audience. I agree calls `chat.agreeRules()`. Cancel calls `chat.dismissRules()`, and a held announcement's sheet opens again with its words and audience;
    - when `agreeRules()` answers false the sheet stays open with `error` `rulesNotSaved`, and I agree can be tapped again.
  - **The person's sheet,** on the people list and in the chat: "Report <name>", then "Block <name>" (red, in-place confirm) or "Unblock <name>". The connection actions hide while blocked. A "Blocked" badge on the row shows to the blocker only.

- [ ] **Step 1: Extend `verify-chat.mjs`.** The labels s1 to s10 keep clear of plans 1 and 2. Plan 1 has an (s) of its own (`verify-chat.mjs:1211`), and plan 2 uses (gr1) to (gr9).
  - (s1) Long-press on Leo's message → Report message. The reasons are radios, and Send report is disabled with the hint `pickReason`. Spam → Send → `report_message` with `{p_id, p_reason: "spam", p_details: null}`, then the thanks line.
  - (s2) The same, answered offline: the sheet stays, the typed details stay, and the error line shows.
  - (s3) Long-press on one's own message, and on a system line: no Report message.
  - (s4) The menu → Report or block → Leo → Block Leo. The confirm reads "Block Leo? You won’t see Leo’s messages, and Leo won’t know. Any connection between you ends, and unblocking won’t bring it back." Confirm → `block_user` with `{p_user, p_block: true}`. Then `chat_summary` and `chat_messages` are called after it, once each (the replace), and no bubble by Leo remains (G-S8, G-S14). A poll or a signal during the test may add a `since`, which this no longer forbids (N14 (c)).
  - (s4b) The menu → People in this chat → `/guests` → Leo → Block Leo → confirm. Before Back, `chat_summary` and `chat_messages` have been called after `block_user` (the mounted chat's replace, with no refocus). Back: no bubble by Leo (B3).
  - (s4c) With Leo blocked, push `/blocked-people` in place over the chat (by expo-router's own router, `verify-chat.mjs:588-594`) → Unblock Leo. Before Back, `chat_messages` has been called after `block_user` with `p_block: false`. Back: Leo's bubbles are there again (B3).
  - (s5) As a host blocking a guest, the confirm reads "Block Leo? You won’t see Leo’s messages or announcements, and you won’t be able to remove Leo’s messages. Any connection between you ends, and unblocking won’t bring it back."
  - (s6) A tap on an author's name → Block → confirm: focus lands on "Blocked".
  - (s7) With `rules_accepted: false`, Send opens "Chat rules". Cancel sends nothing and keeps the words in the field. I agree calls `accept_chat_rules`, then `send_message` once.
  - (s7b) With `rules_accepted: true` in the summary but `send_message` answered `22023 'Rules not accepted'`: the bubble reads "Not sent. Tap to retry.", "Chat rules" opens with "Your message hasn’t been sent. Agree to the chat rules to send it.", and no "Check your connection and try again." shows. I agree calls `accept_chat_rules`, then `send_message` once, with the same `p_client_id`.
  - (s7c) I agree answered offline: the sheet stays with "That didn’t go through, so nothing was sent. Try again.", and `send_message` isn't called. A second I agree calls `accept_chat_rules` again, then `send_message` once (I6).
  - (s7d) As a host, with `send_announcement` answered `22023 'Rules not accepted'`: the Announce sheet closes, and "Chat rules" opens with "Your announcement hasn’t been sent. Agree to the chat rules to send it." I agree calls `accept_chat_rules`, then `send_announcement` with the same `p_client_id`, `p_body` and `p_audience` (I6).
  - (s8) A send answered `22023 'Not allowed'` shows "That message can’t be sent."
  - (s9) Alone in the chat, the menu has no Report or block.
  - (s10) A row with state `removed` and payload `{by: "resbite"}` shows "Message removed by Resbite". A host's removal, with no payload, shows "Message removed by an admin" (CH-R-A3).

  `chatSession.test.ts` (with the fakes the file already uses):
  - two queued messages refused with `22023 'Rules not accepted'`: `rulesNeeded.clientIds` holds both ids and `error` stays null. `agreeRules()` calls `acceptRules` once and then sends each once with its own client id, and `rulesNeeded` is null after;
  - `acceptRules` rejecting: `agreeRules()` is false, nothing is sent, and `rulesNeeded` is unchanged. `dismissRules()`: `rulesNeeded` null, both items still failed;
  - a "blocks changed" event while the session is blurred, with no focus: the summary and the newest page are read and the list is replaced. After `dispose()` an event reads nothing (B3).

  `verify-event.mjs`:
  - the people sheet shows Report and Block;
  - a waiting join request's sheet shows Block and no Report;
  - a blocked person's row shows "Blocked" and no Connect; with `my_blocks` answering an error, no row shows Block or Connect (N13);
  - NOTE 2: on the people list, Leo connected: Block Leo → confirm → `my_blocks` and `plan_connection_states` are each called again after `block_user`, and Leo's row shows "Blocked" and no Connect. Unblock Leo → both are called again (the stub now answers Leo `none`), and the row shows Connect, not Connected;
  - B1: a pending invitee's page on Ana's resbite ("Hosted by Ana") with "Announcement from Ana · Doors open at 19:30" has a "Report or block" button beside the line, at least 44 pt. It offers Report message, Report Ana and Block Ana (Ana once). Report message → Spam → Send calls `report_message` with the overview entry's `id` as `p_id`. Block Ana → confirm calls `block_user` with `{p_user: Ana's id, p_block: true}`, then `my_chat_overview` again, and the line is gone;
  - B4, R-Q1, I-2: a pending invitee on Ana's resbite whose overview names Pedro as inviter, with no announcement: More (beside the answer control) → Report or block → Report Pedro, Block Pedro, Report Ana, Block Ana, in that order. Block Pedro calls `block_user` with Pedro's id. Report Pedro → Spam → Send calls `report_user` with `{p_user: Pedro's id, p_series, p_reason: "spam", p_details: null}`. Block Ana's confirm reads "Block Ana? You won’t see Ana’s messages or announcements, and Ana won’t know. …" (`theyHost`), and Pedro's "Block Pedro? You won’t see Pedro’s messages, and Pedro won’t know. …";
  - I-2: the same page with `my_chat_overview` answering an error: More → Report or block offers Report Ana and Block Ana, and nothing else.

  `verify-connections.mjs` (I3):
  - a request card's ••• → Report Leo → Spam → Send calls `report_user` with the request's `series_id` as `p_series`;
  - a request card's ••• → Block Leo → confirm calls `block_user` with `{p_user, p_block: true}`, then `my_connections` again, and the card is gone;
  - a connection row's ••• → Block Leo → the same, and the row is gone. A connection row has no Report.

  `review-ui.mjs`, on `/plans` (confirmation S7, B4, I-2):
  - a pending invitee's card "Ana invited you" with "Announcement from Ana · Doors open at 19:30": a long-press → Report message → Spam → Send calls `report_message` with the overview entry's `id` as `p_id`;
  - a long-press → Block Ana → the confirm reads "Block Ana? You won’t see Ana’s messages or announcements, and Ana won’t know. Any connection between you ends, and unblocking won’t bring it back." Confirm calls `block_user` with `{p_user, p_block: true}`, then `my_chat_overview` again, and the line is gone;
  - a pending card "Ana invited you" with no announcement, whose overview names Pedro as inviter: a long-press offers Report Pedro, Block Pedro, Report Ana and Block Ana, and the card's `accessibilityActions` name the same four.
- [ ] **Step 2: Run** with Expo web → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm run check`, `verify-chat.mjs`, `verify-event.mjs`, `verify-connections.mjs`, `review-ui.mjs` → PASS.
- [ ] **Step 5: Commit:** `"Safety: report, block and the chat rules from a message, a person, the chat, an invitation and Connections"`

### Task 6: Blocked people, the contact address and Data & privacy

**Files:**
- Create: `mobile/app/blocked-people.tsx` (route `/blocked-people`)
- Modify: `mobile/app/_layout.tsx` (its Stack entry, beside chat core's `<Stack.Screen name="chat" />`), `mobile/app/data-privacy.tsx` (a "Blocked people" row, a "Contact" topic, the reports line in plan 1's "Chat messages" topic, `data-privacy.tsx:90-101`), `mobile/scripts/verify-deletion.mjs` (the script that covers the Privacy screen at `3b5be48`), `mobile/scripts/review-ui.mjs` (chat core's check of the Chat messages topic's exact text, `review-ui.mjs:140-143` at `333747d`, gains the reports line)
- **After plan 2's Task 4** (Sequencing): it changes `review-ui.mjs` (not the Chat messages check, which keeps its text). `review-ui.mjs` answers an unplanned request with an error (`Unexpected …`), so this task's and Task 5's new calls (`my_blocks`, `block_user`, `report_*`) are stubbed there.

**Interfaces:**
- Consumes: Task 4's gateway and copy; `expo-clipboard`, already a dependency (`mobile/package.json:25`); `Linking`, as `mobile/src/design/TickRow.tsx:91` opens the Terms.
- Produces:
  - **Blocked people** (G-S10): a Row on Data & privacy, after the topics, opening `/blocked-people`. The screen lists `my_blocks` by name, cleaned with `cleanName` (Task 4) and "Someone" (`CHAT_COPY.someone`) when null, each with "Unblock <name>", which acts at once through the gateway, so an open chat beneath hears the "blocks changed" event (B3; Task 5's (s4c)). With nobody: `noneBlocked`. A failed read shows the error line with Try again. A failed unblock keeps the row and shows `safetyErrorMessage`.
  - **A "Contact" topic,** shown only when `supportAddress(process.env.EXPO_PUBLIC_SUPPORT_ADDRESS)` is not null, so never for a value that isn't an address (G-N10, challenge N9): the `contact(address)` line with the address as selectable text, a "Copy address" button (`expo-clipboard`, then `copied` announced), and the address as a `mailto:` link opened through `Linking`.
  - **Plan 1's "Chat messages" topic** (`data-privacy.tsx:90-101`, whose text keeps chat core's hedge about account deletion, H38) gains `reportsPrivacy` (G-S11), with the reporter's own reports and the 180 days in it (I11, R-Q3).

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
- **After plan 2's Task 4** (Sequencing): it adds plan 2's part to all three files. The `README:N` lines below are chat core's runbook at `333747d`; plan 2's Task 4 (`93aa1da`) adds its groups part, so find each place by its heading or step. What plan 2's part gives this task: "Plan 3 adds its own questions here (for example the support address, the moderators and the blocked terms)" in step 0, which this plan's questions replace; step 2's "plan 3's file follows it in the same sitting", after `ch2-apply.sh` and the history `23 | 20261111150000`; the fingerprint from chat core's 464 to plan 2's 479, its rollback back to 464; `ch2-after-checks.sh`; and in Rollback, "Chat groups' steps (plan 2), before chat core's", whose step 1 is "Plan 3's rollback first".

**Interfaces:**
- Produces:
  - The App Store review notes, which say:
    - how to reach a chat with the review account: the group chat runbook step 6a sets up (it never closes while it repeats), with another account's messages and an announcement in it, and the invitation with an announcement (I8);
    - that everyone agrees to the chat rules before writing, and that a blocked-terms check stops messages and announcements before they are stored (the filtering of 1.2). Titles, notes to guests and names are not filtered, so the notes don't claim they are (challenge N4);
    - where Report and Block are (a message's long-press, a person's sheet, the chat menu, an invitation's card and resbite page, Connections), and where a block is undone (the person's sheet, Data & privacy → Blocked people);
    - that a block takes the person's messages off the blocker's screen at once (B3), and that the team sees each block in its daily queue (I10);
    - that each report pushes the Resbite team, who check the queue daily, and remove content and suspend accounts within 24 hours;
    - the contact address.
  - **The completed release runbook.** Chat core wrote `qa/chat-release/README.md` in parts, for plans 2 and 3 to extend (README:7), and plan 2 adds its groups part. This plan completes it inside the sections and step numbers chat core built, rather than a new list. Those numbers are cited by the scripts' comments and by the runbook's own cross-references ("step 0's question", "Rollback, step 2"). Owner-run scripts keep chat core's shape: `! bash ~/<name>.sh`, written into the home directory from a block in the step, checking the file's sha256, running from `${REPO:-$HOME/dev/resbite-app}`, and printing no secret, number or account id (README:178-183). Each step with its owner approval:
    - **The header** (README:1-14): the runbook is now whole. "Written in parts … nothing here is run" (README:7) and "Report and block (plan 3) must ship with any chat" become this release's order. The Code line names the three branches.
    - **What is built, Files and hashes, Checks made locally** (README:15-155):
      - a safety section in the same shape;
      - this migration, its rollback, its before/after files and the seven ops scripts with their sha256, beside the base hashes this plan's copies were checked against (the Bases table: plan 2's `f7a34398…d28`, chat core's `1047fb37…ce`, and the connections, circles and phone_key files');
      - the hosted-baseline command with all five candidates and its PASS count;
      - the fingerprint replay on from plan 2's count (479 in plan 2's runbook), and the rollback back to it.
    - **The Order list** (README:161-171) gains 5a, 5b and 6a in their places. The reports queue is a standing duty under its own heading after step 8, not a numbered step, so "steps 2 to 6" (README:361) keeps meaning the rollout (challenge N11).
    - **Step 0, the owner questions** (README:185-196). This plan's questions take the place of the line "Plan 3 adds its own questions here (for example the support address, the moderators and the blocked terms)", which plan 2's Task 4 leaves where chat core's "Plans 2 and 3 add their own questions here" was (README:196; challenge N11), after plan 2's G-QC. Each with "needed before" and its default, as the roadmap's owner table has them. The build proceeds on the defaults:
      - the support address (needed before step 5b);
      - who moderates (default: the owner). A moderator other than the owner can read and act on reports only in the SQL editor, with the queue's scripts: there is no screen for it (challenge N8);
      - the blocked terms (default: none seeded, and the release waits for a list);
      - the chat rules' wording and the Terms document (default: the rulings' wording, the Terms unchanged);
      - G-S13's default for invitations;
      - **R-Q1, Report from an invitation.** Report the person is offered wherever Block is on an invitation (the card and the resbite page). It reports a person, not "this resbite", so the spec's non-goal stands. Default: yes (Decision 14);
      - **R-Q2, a block reaching the team.** Yes, as I10: listed in the queue's daily read, with no push. Default: yes (Decision 15);
      - **R-Q3, how long a closed report is kept.** 180 days after it is closed, then `purge-closed-reports.sql` deletes it. Another period is `private.report_keep_days()` before step 2 (a new migration hash) and the number in `reportsPrivacy` (a new build). Default: 180 days (Decision 7);
      - **R-Q4, who answers within 24 hours when the owner is away. Release-blocking.** The owner names a backup reader before the release, and "Applied" records that one is named (no name, number or account id in this file). Until then the runbook says the owner alone reads the queue daily. Needed before step 6a's submission, which waits for it;
      - **R-Q5, a blocked person's join requests.** No push of any kind from a blocked person to the blocker, join requests included. The request still shows in the requests list to every host, the blocker included, who can decline it. The resbite's own changes still arrive. Default: yes (Decision 18);
      - plan 2's owner questions are in its part of this step.
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
    - **Step 5a (new), in the SQL editor, after step 4** (G-S12, challenge N11). A moderator set before the sender's redeploy would get `report_filed` from the old sender as a `plan_update` push that opens the reported resbite. Run `supabase/ops/moderators.sql` with the moderators' emails, and `supabase/ops/blocked-terms.sql` with the owner's list. **Release gate:** `select count(*) from private.blocked_terms` is above 0, and `private.moderators` has at least one row. Otherwise the release waits.
    - **Step 5b (new):** `EXPO_PUBLIC_SUPPORT_ADDRESS` set in the EAS production environment before the build is made, checked with `npx eas env:list --environment production`, and an address (`supportAddress` treats anything else as unset, challenge N9). Submission is blocked until it is set.
    - **Step 6, the TestFlight build** (README:355-360): only after steps 2, 4, 5, 5a and 5b. It is submitted for review only after step 6a.
    - **Step 6a (new), App Review** (challenge I8):
      - **the review account:** a tester account Going on a group (its chat never closes while it repeats) or on a resbite a month out. In that chat a second account has written messages and posted one announcement, and the review account hasn't accepted the chat rules yet. The account is also invited, unanswered, to a second resbite with an announcement. So a reviewer finds Report and Block in an open chat, on the invitation card and on the resbite page. Its sign-in goes into App Store Connect's review notes, never into this file;
      - on the installed build: Data & privacy shows the support address, and a report's thanks shows it. `EXPO_PUBLIC_*` is fixed when the bundle is built, so a value set after the build doesn't count;
      - the owner enters the support address on the App Store listing (CH-P13);
      - R-Q4 is answered;
      - then submit, with the review notes pasted into App Store Connect.
    - **Step 7, device checks** (README:361-418): chat core's as written, plan 2's groups checks, and these:
      - a blocked person's messages, pinned card and unread dot are gone on the blocker's phone;
      - the blocked phone sees "Request sent" after asking;
      - a report reaches the moderator's phone as "A new report is waiting.", its tap opens nothing, and signing out clears it from Notification Center (Task 3);
      - the rules sheet comes before a first message, and after a refusal it says what wasn't sent;
      - a blocked term is refused;
      - the report sheet scrolls at the largest text size with the keyboard open;
      - Block from People in this chat, then Back: the person's messages are already gone. Unblock in Blocked people, then Back to the chat: they are back (B3);
      - an unanswered invitee's resbite page with an announcement: "Report or block" beside the line reports the announcement and blocks its author, and the line goes (B1);
      - an unanswered invitee brought by a guest, with no announcement: the card's long-press and the page's More offer Report and Block for the bringer and for the owner, and the block stores (B4, I-2);
      - a host who blocked a guest's bringer gets that guest's answer as "Clara is going.", with no "brought by" (I-3);
      - Connections: Block from a request card and from a connection row, and Report from a request card (I3);
      - Report from a message, from a person, from the card and from the page; Data & privacy shows the address in the installed build, and a report's thanks shows it (I8).
    - **Step 8,** the throughput check (README:420-436), as built. `report_filed` counts among `other_pending`, never the chat backlog.
    - **The reports queue (new; a standing duty under its own heading after step 8, not a rollout step; challenge N11), in the SQL editor:**
      - the moderator's push, plus a daily run of `open-reports.sql`: the open reports, the blocks of the last 7 days (I10) and a `due` row when closed reports are due;
      - for each report, `remove-reported-message.sql` and `suspend-account.sql` as needed;
      - for a suspension, the Auth dashboard ban (owner);
      - then `close-report.sql`, recording which action was used;
      - with a `due` row, `purge-closed-reports.sql` (R-Q3);
      - target: within 24 hours of the report. Until R-Q4's backup is named, the owner alone reads the queue daily.
    - **Rollback** (README:442-497): the full order and guarded chain already name this plan ("chat 3, chat 2, chat 1…"). Add "Chat safety's steps (plan 3)" before plan 2's "Chat groups' steps", with `! bash ~/ch3-rollback.sh`, in `ch1-rollback.sh`'s and `ch2-rollback.sh`'s shape: the hash, one transaction, the fingerprint back to plan 2's count (479).
      - It goes first: plan 2's rollback refuses while `private.blocks` exists.
      - **The app first** (challenge I9), as chat core's rollback step 1 does (README:457). A build with this plan's app can't write against a database without it. `chat_summary` has no `rules_accepted` there, so every Send opens the rules sheet, and I agree calls `accept_chat_rules`, which is gone. Its people lists get no `my_blocks`, so they show no Block and no Connect. Chat without report and block may not reach testers (the spec's Anti-goals). So a chat 3 rollback means making a build without chat the testers' build first, or rolling back all three plans.
      - **The sender stays** for a chat 3 rollback alone (challenge I9). It sends nothing of this plan's once the rollback has deleted the `report_filed` rows, and it is the chat sender chat core needs. It goes back only with chat core's rollback (README, Rollback step 2).
      - Say what is lost: every block, report, moderator, acceptance and blocked term.
      - Remove this migration's line from `migrations.txt`.
    - **Known gaps** (README:499-511): the gaps this plan accepts:
      - a team removal reads "Message removed by an admin" on a build without plan 3;
      - a second phone signed in to the same account, with the chat open, keeps the blocked person's rows until its next full read: the "blocks changed" event is one phone's (B3, Decision 17);
      - pushes from the blocked person already shown stay in Notification Center (challenge N14 (e));
      - what G-S13's default still lets through (challenge N12): a co-host or a guest of the blocked person can invite the blocker to the blocked person's resbite, since that notice's actor is not blocked; and the `'link'` answer asks the blocked person to send the blocker a link outside Resbite;
      - a fold moves a block to the app account, but a connection the app account already had with the blocker stays (I4);
      - the inviter clause reads the outbox's `invited` rows, which are kept today (K-N11). The roadmap's cleanup of delivered rows must keep an unanswered invitation's `invited` row (B4);
      - a message report refused because the message is no longer sent says "You can’t report that any more." with no way on from that sheet; the person's name in the chat still opens Report <name> (challenge N7, listed, not taken);
      - on the invitation card and the resbite page, the owner stays offered after a block, since the owner comes from the plan, not the overview; blocking again changes nothing (I-2);
      - plan 2's parked gap stays as plan 2's runbook records it (ruling GR2): two account deletions at once can deadlock when each owns a group stopped by Edit and each wrote in the other's chat. This plan's deletion copy adds no chat-row lock.
  - Decisions log: a "Chat safety (CH), <date>" section after plan 2's, one line each with no nested bullets (H40), holding this plan's Decisions 1 to 18. Chat core's lines that point to plan 3 now point to it: CH-P7 ("Blocks are plan 3's"), CH-P13 and CH-P18 ("Blocks and reports are plan 3's") (the "Chat core (CH)" section, `knowledge-base/08-decisions.md:622-672` at `333747d`; plan 2's Task 4 adds its "Chat groups" section, which this one follows).

- [ ] **Step 1: Write** the notes and the runbook.
- [ ] **Step 2: Full check:** `bash scripts/test-database-docker.sh`, `(cd mobile && npm run check)`, the edge tests → PASS ×3.
- [ ] **Step 3: Commit:** `"Safety: the review notes and the release runbook"`
