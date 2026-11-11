# Circles of Trust Implementation Plan (plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host sets how many people each guest may bring and how far that trust travels; a trusted guest brings a connection or a phone contact who joins without approval; the host sees who brought whom and can remove anyone, and a person the host removed is not brought straight back.

**Architecture:** One hosted migration (`20261111130000_circles_of_trust.sql`) adds the two circle numbers on `plans`; `brought_by` (pointing at `auth.users`, never `profiles`) and `level` on `attendees` and `phone_invitations`; `private.plan_removals`, a host's per-series memory of whom they removed, declined or revoked; `set_plan_circle`, the allowance (`bring_allowance`, `my_bring_allowance`) and four people-list functions (`plan_bringers`, `plan_brought_invitations`, `revoke_brought_invitation`, `withdraw_brought_invitation`). It redefines `invite_contacts` (a non-host whose allowance covers the batch brings people), `answer_phone_invitation`, `personal_invitation_page`, `roll_repeating_plans`, `remove_guest`, `decide_join_request`, `revoke_phone_invitation`, `plan_phone_invitations`, `claim_notification_deliveries` and, where it exists, `request_account_deletion`. The app gets the Circle of trust card on Invite people, the "Bring someone" row with a bring mode of Invite people, and the chain on the people list. The sender's `rsvp` copy says "· brought by Pedro"; the web page names the inviter.

**Tech Stack:** as plan 1, plus the link site (`links/`, Vercel, node tests).

**Spec:** `docs/superpowers/specs/2026-11-10-connections-and-circles-design.md` (CO-D4, CO-D5, CO-D7, CO-P7–P13, CO-P15, rules 6–11, screens CO-04–CO-07; mockups `docs/superpowers/specs/2026-11-10-connections-groups-chat-mockups/circle-of-trust.html`). Where this plan departs from the design, the Revisions say why.

**Branch:** `co2-circles-of-trust` from `main` after the follow-ups plan (`docs/superpowers/plans/2026-11-11-connections-3-follow-ups.md`) is merged: its migration `20261111120000_connections_follow_ups.sql` redefines the roll this plan copies. Plan 1 is live (hosted migration `20261110120000`). Every file:line below was checked against `main` at `3b5be48` and the follow-ups branch at `3041cef` (`.worktrees/co3-follow-ups`; its roll is unchanged since `47bb314`).

## Revisions

What changed from the plan of 10 November, and why. Items 1–4 came when plan 1 shipped; the rest answer the challenge (`.superpowers/sdd/challenges/circles-of-trust.md`) under the controller's rulings (`circles-rulings.md`).

1. Migration renamed `20261111130000_circles_of_trust.sql`, after the follow-ups' `20261111120000` (plan 1 shipped).
2. Each redefined function names the file and line of its latest body, in Task 1 (plan 1 shipped; finding 17).
3. `invite_contacts` opens with `require_tester()` and branches on `private.is_host`, never on `require_link_owner` failing, so a host on an ended plan still gets 'Active plan owner required' (`supabase/tests/creating-a-resbite.sql:150`) (finding 16).
4. Commands for this machine: edge tests through the tsx loader, Expo started once before `typecheck` (finding 23).
5. Both `brought_by` columns reference `auth.users(id) on delete set null`, with an assertion that exactly one foreign key links `attendees` to `profiles` (C-R1, finding 1).
6. `private.plan_removals` remembers per series whom a host removed, declined or revoked; a non-host cannot bring them back; a host's own invitation clears it (C-R2, finding 2).
7. The non-host phone path's rules for existing rows, counted in the loop, 22023 as soon as the count passes `remaining` (C-R3, finding 3). Two departures, for the controller: the caller's own live row takes the new code, because the app sends the code it just minted (`mobile/src/state/useResend.ts:66-73`) and keeping the old one would send a dead link; and C-R3's "reopen a host-revoked row" test becomes a 42501 test, because C-R2 records a host's revocation; the counted-and-attributed reopen is tested on a row its own bringer revoked. Both accepted (C-R10).
8. A host's `link` item makes the row the host's (`brought_by` null, level 1), live or revoked, since the host's upsert already rotates a live code (extends C-R3's "hosts included").
9. A `{user}` item meets the same rules through the person's phone key: someone else's live link gives `already`; the caller's own live link is replaced, uncounted (finding 3, last bullet).
10. `may_bring` no longer includes the count; both allowance functions return `remaining`; not `may_bring` → 42501, too many new → 22023 (C-R4, finding 4).
11. The circle columns are read through `planColumns` and are optional on `Plan`; the wrong `planWithDetails` step is gone; the browser stub checks the select (C-R5, finding 5).
12. A bringer revokes their own unanswered link (`revoke_phone_invitation` widened) and withdraws their own unanswered in-app invitation (`withdraw_brought_invitation`); a bringer lists only their own links (C-R6, finding 6).
13. `plan_bringers` names the bringers; `Guest.broughtById`; `peopleGroups` takes `bringerNames` (C-R7, finding 7).
14. Hosts get a bringer's unanswered links from a new `plan_brought_invitations` (id, last two digits, the bringer's first name; never the number) and remove them by id. `plan_phone_invitations` leaves those rows out for hosts instead of reshaping them, so installed builds, which read `phone` on every row (`mobile/src/services/contactInvites.ts:137-141`), see today's shape. The host's line says "Invited by link" for others' links: the channel lives on the bringer's phone (finding 8; its "store sent_via" option not taken). The mockup's name "Juli" is not knowable by the host. Accepted (C-R10).
15. `broughtNames` comes from the bringer's own pending, Going and Maybe brought rows plus their own unanswered links (finding 9).
16. Bring mode is written out: its gate, allowance, organizer's name, errors and Send again's message; `useResend.ts` joins Task 4 (finding 10).
17. The concurrency script is wired into `scripts/test-database.sh`, the SQL test into `tests.txt`; a second race (the host lowering the circle while a guest brings) proves the plan-row lock, with a recorded mutation run (finding 11).
18. The roll slice runs on its own plan with app sessions; a brought person who said Can't go is carried (CH-P20) and may push `used` past `allowed` (an owner question, below); CO-P12 overrides CO-P8's "carried along a series is level 1" (finding 12).
19. `phone_invitations.brought_by` is set when the link is sent and copied on answer; `used` and `inviter` read it (finding 13).
20. Deletion clears both `brought_by` columns and the person's removal rows; every reader skips a deletion-pending bringer (finding 14).
21. The web flow names the inviter in `notYours`, `confirmBody`, `wrongNumber` and `noscript`, and keeps the host in `hostSees`, `hostCanSee`, `nameHelper` (finding 15).
22. `claim_invite` is not redefined; `decide_join_request` is, for the removal record only (finding 16, C-R2).
23. The rollback lists each restore source and is rehearsed in the SQL test (finding 17).
24. The bring cap applies in `toggle`, `choose`, `addNumber` and `toggleUser`, and lets a replacement through (finding 18).
25. Spoken option labels, the sentence after the controls, the sheet head, a smaller indent under Larger Text (finding 19).
26. Copy matches the design: CO-07's list line, "1 more person", `broughtByJoined`, first names; CO-04's read-only card is dropped because Invite people is closed after the end (`mobile/app/invitations.tsx:72`) (finding 20).
27. The card disables while saving, falls back to the last saved value, hides in the preview, maps 42501 to `saveFailed` plus a reload; the version bump is intended (finding 21).
28. Test ids use `f6` (`f7` in the script) (finding 22); the kit's `Segmented` takes four options (finding 24); the migration goes live before the TestFlight build (finding 25); `phone_invitations.level default 1` overrides the design's `default 2` (finding 26); `brought_by_name` only for `rsvp`, four answers tested (finding 27); accepted risks written down (finding 28); lock order kept and commented (finding 29); the untested behaviours get tests (finding 31).
29. New copy uses the typographic apostrophe, as the rest of the copy does (verification).

**Not adopted**
- Finding 30 (ordering with the chat plans): nothing in this plan changes, and the roadmap is outside this revision. For the roadmap's notes: chat-1 copies `claim_notification_deliveries` and the guarded `request_account_deletion` from this migration, and its trigger on `public.plans` must ignore updates that change only `bring_invites`, `bring_levels` and `version`; chat-2 copies the roll from here; chat-2's test prefix `g2` is not hexadecimal.

**Revision 3 (11 November 2026).** C-R15 and C-R16: the rollback refuses while chat is applied; slice 17 asserts that refusal when chat exists.

**Revision 2 (11 November 2026)**, from the confirmation (`.superpowers/sdd/challenges/circles-confirmation.md`) under C-R13:
1. Bring refusals reach the screen worded: `inviteErrorMessage` maps 'Not allowed to bring people here' and 'No invites left', and `services/contactInvites.ts` with its test joins Task 4; `bringErrorMessage` is gone (S1).
2. `guests.tsx` passes `bringing` to `useResend`, and Task 7 (e) checks Send again's message (S2).
3. `plan_phone_invitations` rows get no `id`; `supabase/tests/creating-a-resbite.sql:400` joins Task 1 and now expects `[]` from a guest who brought nobody (S3).
4. Slice 4 tests the over-cap batch before 03 spends its invite; slice 6 sets the circle to (1,2) before `{user 07}` (S4).
5. The rehearsal checks every redefined function comes back exactly with its grants and every new object is dropped, in the follow-ups' before/after shape (S5).
6. `mobile/app/event.tsx:140` joins Task 5 (N1).
7. A host's plain `revoke_phone_invitation` writing the removal record is tested (N2).
8. A host's in-app invitation of a person revokes any live link on that person's phone, a bringer's included, and so frees that invite; tested (N3).
9. The rollback runs before the follow-ups rollback and refuses once that one has run, with a guard in the follow-ups rollback's shape (N4).
10. `plan_removals` keeps one row per key, a user row and a phone row (N5).
11. The cap counts `inviteCount`, numbers and connections together (N6).
12. Concurrency scenario (a) is marked as a behaviour check that cannot fail locally (N7).
13. The follow-ups citation is the branch head `3041cef`; Revisions item 28 says four answers (N8).
14. The web page's inviter line names the host by first name: "Pedro invited you to Ana’s resbite" (N9).

## Global Constraints

Same as plan 1, verbatim: no hosted touch in this plan; the house function and table shapes and error codes; rollback and hosted-baseline files with both harness modes green; pushes through the outbox with UX2-D4 wording; copy in `*Copy.ts` with exact-string tests and every new test appended to `mobile/package.json`; `npm run check` green; Expo v57 docs first; UX2-D6 names rule; 44 pt and labels; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; commit per task, never push. Plus:

- **Installed builds keep working once the migration is live:** no new foreign key from a public table to `public.profiles`; no change to the shape of a reply an installed build reads (`plan_phone_invitations` for hosts, `invite_contacts`' kinds, `personal_invitation_page`'s existing keys).
- **Error words:** 42501 'Not allowed to bring people here' (no allowance, or a person a host removed), 22023 'No invites left', 22023 'Invalid circle', 42501 'Not your invitation' (withdraw), 42501 'Names required' (`plan_bringers`), 42501 'Not invited' (`my_bring_allowance`). Everything else keeps today's text.
- **First name** means the first word of `display_name` (`split_part(btrim(display_name),' ',1)` in SQL, `firstName()` in the app).
- **Commands on this machine:** SQL `bash scripts/test-database-docker.sh` (full) and `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261111120000_connections_follow_ups.sql supabase/migrations/20261111130000_circles_of_trust.sql` (drop the first candidate once the follow-ups migration is in `supabase/tests/hosted-baseline/migrations.txt`); edge tests `node --import ./mobile/node_modules/tsx/dist/loader.mjs supabase/functions/_shared/<file>.test.ts` from the repo root (Node here lacks `--experimental-transform-types`); mobile tests `cd mobile && node --import tsx <file>`; link tests from `mobile/`: `node --test ../links/personal.test.mjs`, `node --import tsx ../links/personal-flow.test.mjs`, `node --import tsx ../links/verify-personal.mjs`. After new screens land in a checkout, start Expo once (`npx expo start --web --port 8081`, stop it by its process group) before `npm run typecheck`: the typed-route file is generated and git-ignored.
- The link site is generated with `node --import ./mobile/node_modules/tsx/dist/loader.mjs links/generate.mjs …`; deploying it is an owner-approved rollout step, not part of this plan.
- The CO-P2 group exception (anyone on a group may be asked) is the chat plan's, not this one's.

## Review Focus

1. **Installed builds the moment the migration is live.** Expected: `profiles(display_name)` embeds on `attendees` still resolve (exactly one foreign key from `attendees` to `profiles`), and a host on an installed build sees today's invitation list, with no row lacking a number. Test: Task 1 slice 1 and `after.sql`; slice 13 (`plan_phone_invitations` as the owner returns no `level > 1` row).
2. **The cap under re-sends and batches.** Expected: re-sending your own live link spends nothing; someone else's live link is `already` and its code unchanged; two new items with one invite left refuse the whole call and write nothing; the same connection twice is one `app` and one `already`. Test: Task 1 slices 4 and 6.
3. **Two phones spend the last invite, or the host lowers the circle mid-bring.** Expected: one person added and one 22023 'No invites left'; or 42501 and nobody added. With the allowance read moved above the plan-row lock, scenario (b) fails. Test: Task 1 Step 5 (`circles-concurrency.sh`).
4. **The circle card on a return visit.** Expected: it shows the saved numbers, and a tap changes only the number tapped. Test: Task 3 (`circleOf`, `circleSave`) and Task 7 (a) (the select assertion).
5. **The host removes someone.** Expected: after Clara is removed, Pedro cannot bring her back by connection or by number until a host invites her; after Pedro is removed, Clara stays, one step up, "Brought by Pedro". Test: Task 1 slices 7, 8 and 14; Task 5 "removing the bringer moves the brought up and keeps the words".

## Accepted risks and the owner question

- **Owner question (finding 12).** The roll carries every guest (CH-P20), so a brought person who said Can't go comes back pending with their bringer, and the bringer's `used` on the next occurrence can exceed `allowed` (shown as no invites left, `remaining` 0). Built that way by default (C-R11); the roadmap's owner table asks the owner before the circles migration. The alternative, not carrying a brought person who said Can't go, is one condition in the roll.
- A bringer learns `already` for a number whose holder is on the resbite, spending nothing. Bringers already read every name (`attendee_read`, `20261014120000_ux2_rules.sql:114`), and `contacts_on_resbite` was already open to every tester.
- Anyone holding a forwarded personal link sees the bringer's first name. The phone-key check is unchanged, so neither lets anyone in.
- Lock order: on hosted, where `require_tester` takes no lock, both `invite_contacts` branches take the plan row and then the caller's advisory lock, and `answer_phone_invitation` takes them the other way round (`20261031120000_creating_a_resbite.sql:309, 318`). The same account inviting and answering on one plan at the same instant could deadlock (40P01). This is improbable, and hosts can already do it today.
- Lock order across two accounts (tester #62, C18-Q6): `decide_join_request` takes the host's and the requester's advisory locks, then the plan row (`require_link_owner`). A host deciding the request of a guest who is bringing someone on that resbite at the same instant (the guest has a guest row and a request still waiting) can deadlock with them on hosted (40P01). Rare, and a retry works. The migration's lock-order note names it too.
- A bringer learns `already` when someone else's live link (a host's or another bringer's) already reaches the number, spending nothing: someone invited that number, not who (C18-Q3).
- A bringer can infer that a host removed or declined someone, or that the person is waiting at the host's door (tester #46): bringing that one person is refused with 42501 'Not allowed to bring people here' while their allowance says they may bring. The message is the same as every other refusal (C-R2) and names nobody.
- A host sees a bringer's unanswered link only as "Number ending ••23 · Invited by link · brought by Sol": no name, no channel.

---

### Task 1: Migration: the circle, bringing, removals and the people-list functions

**Files:**
- Create: `supabase/migrations/20261111130000_circles_of_trust.sql`
- Create: `supabase/tests/circles-of-trust.sql`, `supabase/tests/local/circles-concurrency.sh`
- Create: `supabase/rollback/20261111130000_circles_of_trust.rollback.sql`, `supabase/tests/hosted-baseline/20261111130000_circles_of_trust.before.sql`, `.after.sql`
- Modify: `scripts/test-database.sh` (run `circles-concurrency.sh` right after `connections-concurrency.sh`), `supabase/tests/hosted-baseline/tests.txt` (append `circles-of-trust.sql`), `supabase/tests/creating-a-resbite.sql:400` (a plain guest who brought nobody now gets `'[]'` from `plan_phone_invitations`, not 42501)

**Interfaces:**
- Consumes. Copy each redefined body from here and change only what this task says:
  - `private.invite_contacts`: `20261110120000_connections.sql:321`. It takes `{user}` items (connected pair, `user_eligible`, not `deletion_pending`, else the whole call fails with `42501 'Not a connection'`).
  - `private.answer_phone_invitation`: `20261031120000_creating_a_resbite.sql:304`; `private.personal_invitation_page`: `:266`; `private.revoke_phone_invitation`: `:223`; `private.plan_phone_invitations`: `:653`; `private.remove_guest`: `:665`.
  - `private.decide_join_request`: `20261029120000_open_link_approval.sql:225`.
  - `private.roll_repeating_plans`: `20261111120000_connections_follow_ups.sql:25` at the follow-ups branch head `3041cef`, unchanged since `47bb314` (carries every guest, CH-P20), not creating-a-resbite's.
  - `private.request_account_deletion`: `20261110120000_connections.sql:440`, inside the same `to_regprocedure` guard (`:437-482`), because the deletion lifecycle is local-only.
  - Helpers: `private.require_tester` (hosted `20260917190517_resbite_private_tester_foundation.sql:94`, takes no lock; local `20260918001316_account_deletion_lifecycle.sql:37`, takes the caller's advisory lock), `private.require_link_owner` (`creating_a_resbite.sql:237`), `private.is_host` (`:22`), `private.plan_end` (`:47`), `private.can_see_guests` (`:621`), `private.used_app`, `private.deletion_pending`, `private.phone_key`. Script shape: `supabase/tests/local/decide-join-concurrency.sh`.
- Produces: columns and table.
  - `public.plans.bring_invites smallint not null default 0 check (bring_invites between 0 and 3)`, `public.plans.bring_levels smallint not null default 1 check (bring_levels between 1 and 3)`.
  - `public.attendees.brought_by uuid null references auth.users(id) on delete set null`. Never `public.profiles`: a second foreign key from `attendees` to `profiles` makes PostgREST refuse the `profiles(display_name)` embeds of every installed build with PGRST201 (`mobile/src/services/rsvp.ts:92`, `mobile/app/(tabs)/plans.tsx:104`). Also `public.attendees.level smallint not null default 1 check (level between 1 and 4)`.
  - `private.phone_invitations.brought_by uuid null references auth.users(id) on delete set null`: the bringer, set when the link is sent (the caller when not a host, else null). `private.phone_invitations.level smallint not null default 1 check (level between 1 and 4)`: the answerer's level, 1 for a host's link and the bringer's level + 1 for a guest's. This overrides the design's `default 2` (CO-P8).
  - `private.plan_removals (series_id uuid not null, user_id uuid null references auth.users(id) on delete cascade, phone text null check (phone ~ '^[1-9][0-9]{6,14}$'), removed_at timestamptz not null default now(), check (user_id is not null or phone is not null))`, with partial unique indexes on `(series_id, user_id)` and `(series_id, phone)`, RLS on, no policies, no grants. One row per key: a writer that has both a user and a phone writes a user row and a phone row, each upserted on its own index (an upsert can target only one).
    - Written by an upsert of `removed_at` from: `remove_guest` (`user_id`, except when an admin removes themself); `decide_join_request(…, false)` (`user_id`); a host's `revoke_phone_invitation` and `revoke_brought_invitation` (the row's phone key, plus `user_id` when the row was answered).
    - Cleared by a host's own invitation of that user or phone in `invite_contacts`. Read only by `invite_contacts`' non-host branch.
- Produces: functions. House shape: `private.x` security definer with `search_path=''`, a `public.x` invoker wrapper, revoke all, then grant to `authenticated`. `bring_allowance` is internal, with no grants.
  - `set_plan_circle(p_plan uuid, p_invites smallint, p_levels smallint) returns integer` (the new `plans.version`):
    - `require_link_owner`: hosts only, while open; otherwise `42501 'Active plan owner required'`.
    - `p_invites` must be 0–3 and `p_levels` 1–3, nulls refused, else `22023 'Invalid circle'`.
    - Bumps `version`. An Edit open at the same moment gets its usual `40001 'Plan changed; refresh'`; that is intended. No notices.
  - `private.bring_allowance(p_plan uuid, p_user uuid) returns table (allowed smallint, used smallint, remaining smallint, level smallint, may_bring boolean)`:
    - A host gets `0, 0, 0, 0, false`; someone with no attendee row gets `0, 0, 0, null, false`.
    - Otherwise `allowed = plans.bring_invites` and `level = attendees.level`.
    - `used` counts the attendee rows on `p_plan` with `brought_by = p_user` and `response in ('pending','accepted','maybe')`, plus the `phone_invitations` on `p_plan` with `brought_by = p_user`, `revoked_at is null` and `answered_at is null`.
    - `remaining = greatest(allowed - used, 0)`.
    - `may_bring = status = 'active' and plan_end > now() and response in ('accepted','maybe') and bring_invites > 0 and level <= bring_levels`. The count is not part of it.
  - `my_bring_allowance(p_plan uuid) returns jsonb` → `{allowed, used, remaining, level, may_bring}` for the caller. Neither a host nor on the plan → `42501 'Not invited'`.
  - `invite_contacts(p_plan, p_invites)`, with its signature, kinds and result shape unchanged:
    - **Opening.** `v_uid := private.require_tester()`. Then `if private.is_host(p_plan, v_uid) then perform private.require_link_owner(p_plan)`: the host branch, as today. Else `select … from public.plans where id = p_plan for update`, then read `bring_allowance(p_plan, v_uid)`. The read comes after the lock, so a circle lowered at the same moment is seen. Raise `42501 'Not allowed to bring people here'` unless `may_bring`. Then the advisory lock and `charge_lookup` (phone items only), as today, for both branches. The header comment states the lock order (plan row, then advisory lock, in both branches) and the accepted risk.
    - **What is written.** A non-host's new attendee rows get `brought_by = v_uid` and `level = caller level + 1`; a host's get null and 1. Every phone row created or reopened gets `invited_by = v_uid`, with `brought_by` and `level` set the same way.
    - **Non-host branch, per item, in this order.** `self` and `already` work as today and are never counted.
      1. If the person or number is in `plan_removals` for the plan's series (the `{user}`, the phone's holder, or the phone key) → `42501 'Not allowed to bring people here'` for the whole call.
      2. A live row (`revoked_at is null`) for the number whose `brought_by` is distinct from the caller (a host's row has none) → `already`, nothing written. For a `{user}` item, the number is the user's confirmed phone key.
      3. The caller's own live row → a re-send, not counted. A `link` item takes the item's new code. An `app` outcome (phone or `{user}`) revokes the link and inserts the pending row, as today's phone `app` path does.
      4. Otherwise (a revoked row, or none) → new, and counted. A reopened row takes `invited_by`, `brought_by` and `level` from this invitation.
      - Keep a running count of new items; raise `22023 'No invites left'` as soon as it exceeds `remaining`. The exception undoes the whole batch.
    - **Host branch.** As today, plus two changes. A `link` item's upsert sets `brought_by = null, level = 1` (the host's code is the live one), and `invited_by = v_uid` when the old row was revoked. An `app` or `link` item deletes the `plan_removals` rows of that user, holder or phone key in the series. An `app` outcome, `{user}` included, revokes every live link on the person's confirmed phone key and on the item's key, a bringer's included (as today's phone `app` path does for the item's key), so that bringer's invite is freed.
  - `answer_phone_invitation`: a new attendee row gets the invitation's `brought_by` and `level`; an existing row keeps its own.
  - `personal_invitation_page`: the open payload adds `"inviter"`, the bringer's first name, when `brought_by` is set and that account is not deletion-pending; otherwise there is no `inviter` key. `host` is unchanged.
  - `roll_repeating_plans` (the follow-ups body): the new plan copies `bring_invites` and `bring_levels`; carried rows copy `brought_by` and `level`. This follows CO-P12, which overrides CO-P8's "carried along a series is level 1".
  - `remove_guest` and `decide_join_request` gain only their removal record. Neither changes `brought_by` or `level`: the defaults give CO-P13's level 1. `claim_invite` is not redefined.
  - `revoke_phone_invitation(p_plan, p_phone)`, signature unchanged:
    - A host: as today, plus the removal record.
    - A non-host may revoke a row with `brought_by = caller`, `answered_at is null` and `revoked_at is null`, while the plan is active and not ended, whatever the caller's reply. This writes no removal record.
    - Anything else: `42501 'Active plan owner required'`, as a non-host gets today.
  - `plan_phone_invitations(p_plan)`:
    - A host gets today's rows, in today's shape (no `id`: `supabase/tests/contact-invitations.sql:150,158` compare it exactly), with `level = 1` only.
    - A non-host with an attendee row gets only the rows with `brought_by = caller`, in the same shape (a bringer removes by number), so a guest who brought nobody gets `[]`: `supabase/tests/creating-a-resbite.sql:400` changes to expect that (no leak).
    - Anyone else gets `42501 'Plan owner required'`, so `supabase/tests/contact-invitations.sql:137` (a non-owner with no guest row) stays green.
  - `plan_brought_invitations(p_plan uuid) returns jsonb` (new). Hosts only, else `42501 'Plan owner required'`.
    - Returns `[{id, ending, country, brought_by_name}]`, one per live, unanswered row with `level > 1`, oldest first.
    - `ending` is the last two digits; `brought_by_name` is the bringer's first name, omitted when there is none or the account is deletion-pending. The number itself is never returned.
  - `revoke_brought_invitation(p_plan uuid, p_invitation uuid) returns void` (new): `require_link_owner`. A row of `p_plan` with `level > 1` is revoked as `revoke_phone_invitation` revokes, with the removal record. Anything else is a quiet no-op.
  - `withdraw_brought_invitation(p_plan uuid, p_user uuid) returns void` (new):
    - `require_tester`, then the plan row `for update`.
    - The caller's own pending row (`brought_by = caller`, `response = 'pending'`) on an active plan that has not ended is deleted. Its unsent `invited` notice then fails eligibility (`connections.sql:409`). No removal record.
    - Anything else: `42501 'Not your invitation'`.
  - `plan_bringers(p_plan uuid) returns jsonb` (new). Requires `can_see_guests(p_plan)`, else `42501 'Names required'`. Returns `{ "<bringer id>": "<first name>" }` for each distinct `brought_by` among the plan's attendee rows, leaving out deletion-pending accounts.
  - `request_account_deletion` (guarded) adds three statements: `update public.attendees set brought_by = null where brought_by = p_user`; the same on `private.phone_invitations` (the links stay live, CO-P15); and `delete from private.plan_removals where user_id = p_user`. Its header says the release that brings deletion to hosted carries these.

- [ ] **Step 1: Write the failing SQL test** (`supabase/tests/circles-of-trust.sql`). Ids use the prefix `f6` (hexadecimal; `g1` is not); emails are `co2-…@resbite-test.invalid`; one rolled-back block per slice, in the idiom of `supabase/tests/connections.sql`. Cast:
  - 01 owner 'Ana Host'; 02 'Pedro P', Going; 03 'Marta M', Maybe; 04 pending; 05 Can't go.
  - 06 'Clara C' and 07 are connections of 02; 08 is a connection of 03.
  - 09–11 are phone-only users; 12 is an admin; 13 is a stranger who asked through the link and is connected to 02.
  - Every user has a confirmed phone. 01–06, 08, 12 and 13 have an `app_sessions` row; 07 and 09–11 do not, so their numbers give `link` (a `{user}` item needs no app session).

```sql
-- 1 schema (C-R1): count(*) from pg_constraint where conrelid='public.attendees'::regclass and confrelid='public.profiles'::regclass = 1;
--   the same for public.plans = 1; both brought_by columns reference auth.users with confdeltype 'n'.
-- 2 set_plan_circle: 01 (1,2) → version+1; 12 → ok; 02 → 42501; (4,1), (1,0), (null,1) → 22023 'Invalid circle';
--   ended plan → 42501 'Active plan owner required'.
-- 3 allowance: 01 → 0,0,0,0,false; 02 → allowed 1, used 0, remaining 1, level 1, true; 03 → true; 04, 05 → false;
--   my_bring_allowance as 13 → 42501 'Not invited'; at (0,1) 02 → may_bring false.
-- 4 a connection: 02 {user 06} → 'app', row brought_by 02, level 2; 02 → used 1, remaining 0, may_bring true;
--   02 {user 07} → 22023 'No invites left', no row for 07; 02 [own number, 01's number] → 'self','already', no error;
--   03 (remaining 1) with two new numbers → 22023, no attendee and no phone_invitations row; then 03 [{user 08},{user 08}] → 'app','already';
--   04 → 42501 'Not allowed to bring people here'; 02 on an ended plan and on a cancelled one → 42501;
--   12 at (0,1) invites → host branch, row level 1, brought_by null.
-- 5 levels at (1,2): 06 accepts; 06 phone 09 → 'link', row invited_by 06, brought_by 06, level 3;
--   09 answers accepted → brought_by 06, level 3; 09 → 42501.
-- 6 existing rows (C-R3): 01's live link to 10; 03 phone 10 → 'already', code_hash unchanged, used(03) 0.
--   03 phone 11 → 'link' (used 1); 03 phone 11 with a new code → 'link', no error at remaining 0, code_hash = the new code.
--   03 revokes it → used 0, no plan_removals row; at (2,2) 02 phone 11 → 'link', counted, row brought_by 02, level 2.
--   01 phone 11 → 'link', row brought_by null, level 1, used(02) down by 1.
--   02 phone 07's number → 'link' (used 1 of 2); set_plan_circle(plan, 1, 2) (remaining 0); 02 {user 07} → 'app', no error, that link revoked, used unchanged.
--   02's live link to 06's number (row inserted directly: brought_by 02, level 2; 06 not on the plan; 01 connected to 06):
--   01 {user 06} → 'app', the link revoked, used(02) − 1; the same again with 01's phone item for 06's number.
-- 7 removals (C-R2): 01 remove_guest 06 → 02 {user 06} → 42501, no row. 01 declines 13 → 02 {user 13} → 42501.
--   02 phone 11 → 'link'; 01 revoke_brought_invitation on 02's link to 11 → 02 phone 11 → 42501. 01 phone 11 → 'link', that removal row gone;
--   01 phone 06's number → 'app', 06's removal row gone. 12 removing themself writes no row.
--   01 phone 10 → 'link'; 01 revoke_phone_invitation of their own link to 10 → a phone row for 10; 02 phone 10 → 42501.
-- 8 a sent invitation stands (CO-P15): 02's link to 10 sent at (1,2); circle (0,1); 06 → 42501; 10 answers → brought_by 02, level 2.
--   02 says Can't go: 06's and 10's rows untouched; 01 remove_guest 02: both keep brought_by 02.
-- 9 freed: 03 {user 08}; 08 declines → used(03) 0; 03 by phone → 'link'.
-- 10 no bringer: claim_invite and decide_join_request(…, true) rows → level 1, brought_by null.
--   12 sends a link to 09, then says Can't go: row brought_by null, level 1; used(12) 0; 09 answers → brought_by null; no inviter on its page.
-- 11 already on the plan: 06, invited by 01 (level 1, no bringer), answers a link row inserted for 06's number with brought_by 02, level 2
--   → 06 keeps brought_by null and level 1.
-- 12 the page: 06's link → inviter 'Clara', host 'Ana Host'; 01's link → no inviter key; 06 deletion-pending → no inviter key.
-- 13 lists (C-R6, finding 8): plan_phone_invitations as 03 → only 03's rows, in today's shape; as 13 → 42501; as 01 → no level>1 row, no 'id' key.
--   plan_brought_invitations as 01 → id, ending, country, brought_by_name 'Pedro', no 'phone' key; as 02 → 42501.
--   revoke_phone_invitation as 03: own unanswered → used − 1; 01's link → 42501; after the end → 42501.
--   withdraw_brought_invitation as 02 on pending 06 → row gone, used − 1; as 03 on 06 → 42501 'Not your invitation'; after the end → 42501.
--   revoke_brought_invitation as 02 → 42501.
-- 14 plan_bringers: as 01 → {02:'Pedro', 06:'Clara'}, also after 02 is removed; as 04 → 42501 'Names required'; 02 deletion-pending → no 02 key.
-- 15 the roll, own weekly plan at (1,2): 02 Going; 10 brought by 02, Going; 11 brought by 02, declined before the end;
--   app_sessions rows for 10 and 11 (the roll carries only private.used_app people).
--   End it; private.roll_repeating_plans() as superuser → new plan bring_invites 1, bring_levels 2; 10 and 11 pending, brought_by 02, level 2;
--   bring_allowance(new, 02) → used 2, allowed 1, remaining 0. A removal on the first occurrence still refuses 02 on the new one.
-- 16 deletion, only when to_regprocedure('private.request_account_deletion(uuid,uuid,uuid,text)') is not null (idiom of deletion.sql):
--   02 requests deletion → no attendees or phone_invitations row has brought_by 02; no plan_removals row for 02;
--   02's unanswered link still answers (brought_by null, level 2).
-- 17 the rollback rehearsal, which branches on chat (C-R16): \set circles_rollback `cat :'resbite_repo'/supabase/rollback/20261111130000_circles_of_trust.rollback.sql`;
--   when to_regclass('public.messages') is not null: begin; :circles_rollback must raise 'Roll back the chat migrations before the
--   circles-of-trust rollback' and change nothing (assert in a do block that catches it); rollback; then stop, with no more in this slice.
--   Otherwise (no chat), the rehearsal runs unchanged: begin; :circles_rollback; plans.bring_invites is gone; the restored roll carries a withdrawn guest; where it exists, the
--   guarded request_account_deletion is back to the connections body (no brought_by in its definition); rollback;
--   (the full rehearsal of every object is after.sql's, Step 6).
--   The real rollback rehearsal is the circles after.sql in hosted-baseline mode, which runs right after the circles apply and before any chat candidate.
```

- [ ] **Step 2: Run it to see it fail.** `bash scripts/test-database-docker.sh`. Expected: FAIL at the first new column or at `function public.set_plan_circle(uuid, smallint, smallint) does not exist`.

- [ ] **Step 3: Write the migration.** In this order: the columns, `plan_removals`, the new functions, then each redefinition, copied from its source above and changed only as the Interfaces say. Then the grants.

- [ ] **Step 4: Run the test to see it pass.** `bash scripts/test-database-docker.sh`. Expected: PASS.

- [ ] **Step 5: The concurrency script.** `supabase/tests/local/circles-concurrency.sh "$pg_bin" "$work" "$port"`, in the shape of `decide-join-concurrency.sh`, ids `f7…`, added to `scripts/test-database.sh` after `connections-concurrency.sh`.
  - (a) **Two phones, one invite.** Two sessions as 02, with one invite left, each invite a different connection at the same time (`pg_sleep(0.2)` before commit in one). Expected: one `[{user, kind 'app'}]`, one `22023 'No invites left'`, exactly one new attendee row. This one cannot fail on the local harness: local `require_tester` takes 02's advisory lock first, so the two calls queue whatever the order. It checks behaviour only; (b) is the lock test.
  - (b) **The host lowers the circle mid-bring.** A session as 01 runs `set_plan_circle(plan, 0, 1)` and holds its transaction (`pg_sleep(1)`). While 01 holds the plan row, a session as 02 calls `invite_contacts`; wait for it in `pg_stat_activity`, as the decide-join script does. Expected: 02 gets `42501 'Not allowed to bring people here'`, and no new row.
  - **Mutation run, once, not committed.** Move the `bring_allowance` read above the plan-row lock: (b) must then FAIL, with 02's row appearing. Restore it, and record both results for Task 7's runbook.
  - Run: `bash scripts/test-database-docker.sh`. Expected: PASS.

- [ ] **Step 6: Rollback, hosted-baseline files, both modes.**
  - The rollback runs as one transaction. Its header says: owner's approval only; the follow-ups migration must be applied; people already brought stay as ordinary guests and their levels go; the circle numbers and removal records are lost; a bringer's live links stay live as ordinary invitations, and hosts then see them, numbers included, in `plan_phone_invitations`.
  - **Order** (header and guard, in the shape of `20261111120000_connections_follow_ups.rollback.sql`'s): run it after the chat rollbacks and before the follow-ups rollback, which restores a roll without `brought_by` and `level`. A first `do` block refuses when `to_regprocedure('private.pair_standing(uuid,uuid,uuid)') is null` (the follow-ups rollback has already run, and restoring its roll here would bring back what it removed), raising `'Run the circles-of-trust rollback before the connections follow-ups rollback'` and changing nothing. A second check refuses while chat is applied: when `to_regclass('public.messages') is not null`, it raises `'Roll back the chat migrations before the circles-of-trust rollback'` and changes nothing (chat plan 1 copies this migration's claim and deletion bodies, and chat plan 2's group lines read `brought_by`). Slice 17 asserts this refusal when the chat tables exist (C-R16), and the real rollback rehearsal is `after.sql` in hosted-baseline mode.
  - It restores, from these sources: `invite_contacts` ← connections:321; `answer_phone_invitation`, `personal_invitation_page`, `revoke_phone_invitation`, `plan_phone_invitations`, `remove_guest` ← creating_a_resbite (lines above); `decide_join_request` ← open_link_approval:225; `roll_repeating_plans` ← follow-ups:25; `claim_notification_deliveries` ← push_delivery:101 (Task 2 adds this line); `request_account_deletion` ← connections:440, inside the same guard.
  - Then it drops the seven new functions (`set_plan_circle`, `bring_allowance`, `my_bring_allowance`, `plan_bringers`, `plan_brought_invitations`, `revoke_brought_invitation`, `withdraw_brought_invitation`) with their wrappers, `plan_removals`, and the columns.
  - `before.sql`, in the shape of `20261111120000_connections_follow_ups.before.sql`: `plans.bring_invites` and `private.plan_removals` absent; snapshot `pg_get_functiondef` and `proacl` of the nine redefined functions that exist on hosted (`invite_contacts`, `answer_phone_invitation`, `personal_invitation_page`, `revoke_phone_invitation`, `plan_phone_invitations`, `remove_guest`, `decide_join_request`, `roll_repeating_plans`, `claim_notification_deliveries`; `request_account_deletion` does not exist there) into `private.co2_rehearsal_functions` (RLS on).
  - `after.sql`:
    - `bring_invites` is 0 on existing plans; slice 1's foreign-key counts hold; `plan_removals` has RLS on and no policy.
    - The nine kept their grants; the six public wrappers (`set_plan_circle`, `my_bring_allowance`, `plan_bringers`, `plan_brought_invitations`, `revoke_brought_invitation`, `withdraw_brought_invitation`) are executable by `authenticated`; `private.bring_allowance` is executable by no API role.
    - The rehearsal, as the follow-ups' `after.sql` does it: `begin; \ir ../../rollback/20261111130000_circles_of_trust.rollback.sql`; each of the nine equals its snapshot, definition and grants; the seven new private functions, the six wrappers, `private.plan_removals` and the six new columns are gone; `rollback;`. Then drop `private.co2_rehearsal_functions`.
  - Run full and `--hosted-baseline` with both candidates. Expected: PASS. Record the `sha256sum` of the migration and of the rollback for Task 7.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261111130000_circles_of_trust.sql supabase/tests/circles-of-trust.sql supabase/tests/creating-a-resbite.sql supabase/tests/local/circles-concurrency.sh scripts/test-database.sh supabase/tests/hosted-baseline/tests.txt supabase/rollback/20261111130000_circles_of_trust.rollback.sql supabase/tests/hosted-baseline/20261111130000_circles_of_trust.*.sql
git commit -m "Circles of trust: the numbers, the allowance, bringing and removing on the server"
```

### Task 2: "· brought by Pedro" in the host's push

**Files:**
- Modify: `supabase/migrations/20261111130000_circles_of_trust.sql` (append `public.claim_notification_deliveries`, copied from `20261030120000_push_delivery.sql:101-145`); `supabase/tests/circles-of-trust.sql` (slice 18); `supabase/rollback/20261111130000_circles_of_trust.rollback.sql` (restore it from push_delivery)
- Modify: `supabase/functions/_shared/notification-engine.ts:4-21` (`Delivery.brought_by_name?: string | null`); `supabase/functions/_shared/notification-copy.ts` (`CopyInput.brought_by_name` at `:9-16`, the `rsvp` case at `:61-64`); `supabase/functions/_shared/notification-copy.test.ts`

**Interfaces:**
- Consumes: the claim's jsonb per delivery; Task 1's `attendees.brought_by`.
- Produces:
  - Each claimed row carries `brought_by_name`. For `kind = 'rsvp'` only, it is the first name of the bringer on the actor's attendee row on the plan, when that bringer is not deletion-pending; otherwise null. Other kinds always get null, keeping the payload minimal (UX2-D4).
  - `notificationCopy` for `rsvp` with `brought_by_name` takes the answer's sentence without its full stop, adds ` · brought by <name>`, then the full stop: "Clara is going · brought by Pedro.", "Clara might come · brought by Pedro.", "Clara can’t go · brought by Pedro.", "Clara can’t go now · brought by Pedro.". Without the field the text is unchanged. `actor_name` stays the full display name ("Clara Pérez is going · brought by Pedro.").

- [ ] **Step 1: Write the failing tests.**
  - Copy: the four answers above; `{ kind: "rsvp", detail: "accepted", title: "Board game night", actor_name: "Clara" }` without the field → body `"Clara is going."`; an `invited` input with `brought_by_name` ignores it.
  - SQL slice 18: a device endpoint for 01 (as `supabase/tests/push-delivery.sql:71`). 02 brings 09 by link; 09 answers accepted. `set local role service_role`, then claim. The `rsvp` row for 01 has `brought_by_name = 'Pedro'`; the `invited` row of a connection 02 brought has `brought_by_name` null; with 02 deletion-pending, the `rsvp` row has null.

- [ ] **Step 2: Run them to see them fail.** `node --import ./mobile/node_modules/tsx/dist/loader.mjs supabase/functions/_shared/notification-copy.test.ts` and `bash scripts/test-database-docker.sh`. Expected: FAIL.

- [ ] **Step 3: Implement.** Run both again: PASS, and every other `supabase/functions/_shared/*.test.ts` still passes. Re-run the hosted-baseline mode: PASS. Refresh both sha256s for Task 7.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261111130000_circles_of_trust.sql supabase/tests/circles-of-trust.sql supabase/rollback/20261111130000_circles_of_trust.rollback.sql supabase/functions/_shared
git commit -m "Circles of trust: the host hears who brought whom"
```

### Task 3: The Circle of trust card on Invite people

**Files:**
- Create: `mobile/src/design/CircleCard.tsx`, `mobile/src/domain/circleCopy.ts`, `mobile/src/domain/circleCopy.test.ts`, `mobile/src/domain/circle.ts`, `mobile/src/domain/circle.test.ts`, `mobile/src/services/circle.ts`, `mobile/src/services/circle.test.ts`
- Modify: `mobile/src/services/plans.ts:18-19` (`planColumns` gains `bring_invites,bring_levels`; `planWithDetails` is `*` and already carries them); `mobile/src/domain/plans.ts:7-44` (`Plan` gains optional `bring_invites?: 0 | 1 | 2 | 3` and `bring_levels?: 1 | 2 | 3`: cached and preview plans lack them); `mobile/app/invitations.tsx` (the card above `ConnectionsPicker`); `mobile/package.json`

**Interfaces:**
- Consumes: `Plan`; the kit's `Segmented` (`mobile/src/design/kit.tsx:495`: any number of options, an optional spoken `label` per option, `disabled`, stacks under Larger Text); `useFocusedRefresh`; `readGuests`; `INVITE_COPY.offline`.
- Produces:
  - `CIRCLE_COPY` (`circleCopy.ts`):
    - `heading: "Circle of trust"`
    - `hint: "Let the people you invite bring someone you don’t know. Whoever they bring is in, without your OK."`
    - `eachBrings: "Each person can bring"`, `nobody: "Nobody"`, `howFar: "How far it goes"`
    - `levels: (n) => n === 1 ? "1 level" : \`${n} levels\``
    - `bringsLabel: (n) => n === 1 ? "1 person each" : \`${n} people each\`` (the spoken label of the options "1", "2", "3")
    - `accountsOnly: "Only people with a Resbite account."`
    - `listLine: (invites, levels) => \`Circle of trust: each person brings ${invites}, ${["one level", "two levels", "three levels"][levels - 1]}.\`` (CO-07)
    - `saveFailed: "Couldn’t save the circle. Try again."`
  - In `circle.ts`:
    - `firstName(displayName)`: the first word, `""` for blank.
    - `circleOf(plan): { invites: 0|1|2|3; levels: 1|2|3 }`: a missing column reads as 0 and 1.
    - `circleSentence({ name, invites, levels })`:
      - `invites === 0` → `""`.
      - `levels === 1` → `"${name} can bring ${people(invites)}. ${accountsOnly}"`.
      - `levels === 2` → `"${name} can bring ${people(invites)}, and ${those(invites)} can bring ${invites} more. ${accountsOnly}"`.
      - `levels === 3` → `"${name} can bring ${people(invites)}, and each of them can bring ${invites} more, and so on for 3 levels. ${accountsOnly}"`.
      - Here `people(1) = "1 person"`, `people(n) = "${n} people"`, `those(1) = "that person"`, `those(n) = "each of them"`.
    - `circleSave(state, event)`: a pure reducer over `{ saved, shown, saving }` with events `tap(value)`, `saved(value)`, `failed`. A tap while saving is ignored; `failed` shows `saved` again, not the value tapped before.
  - `circleGateway` (`services/circle.ts`): `createCircleGateway(rpc, deadline?)`, with a default instance that loads the client lazily, as `contactInviteGateway` does. It has `set(planId, invites, levels): Promise<number>`, which calls `set_plan_circle` with `{ p_plan, p_invites, p_levels }` and throws refusals as sent.
  - `circleErrorMessage(e): { message: string; reload: boolean }`: 42501 → `{ CIRCLE_COPY.saveFailed, true }` (the plan ended or the role went; the reload shows the screen's gate); 22023 → `{ CIRCLE_COPY.saveFailed, false }`; anything else → `{ INVITE_COPY.offline, false }`.
  - `CircleCard({ plan, firstGuest, onReload })` (CO-04):
    - Two `Segmented` radiogroups: `eachBrings` (Nobody · 1 · 2 · 3), and `howFar` (1 level · 2 levels · 3 levels), the second shown only when invites > 0.
    - The tinted `circleSentence` comes after both groups in the tree, so it is read after the controls (rule 11).
    - Each change saves at once through `circleSave`; both groups are `disabled` while a save is in flight. A failure shows the message under the card, and a `reload` result calls `onReload`.
    - Never rendered in the preview (no server) or for a guest. The read-only state after the end is dropped: the screen is closed then.
  - `invitations.tsx`:
    - Renders the card when `canEditPlan(…)` and `!preview`.
    - Keeps the `Guest[]` it already reads (`:84-87`) and passes `firstGuest`: the first `accepted` guest's first name, else `"Each guest"`.

- [ ] **Step 1: Write the failing tests.** `circleCopy.test.ts` has every string exactly, including `bringsLabel(1) === "1 person each"`, `bringsLabel(3) === "3 people each"`, `listLine(1, 2) === "Circle of trust: each person brings 1, two levels."` and `listLine(3, 1) === "Circle of trust: each person brings 3, one level."`. `circle.test.ts`:

```ts
assert.equal(circleSentence({ name: "Pedro", invites: 1, levels: 2 }), "Pedro can bring 1 person, and that person can bring 1 more. Only people with a Resbite account.");
assert.equal(circleSentence({ name: "Each guest", invites: 2, levels: 3 }), "Each guest can bring 2 people, and each of them can bring 2 more, and so on for 3 levels. Only people with a Resbite account.");
assert.equal(circleSentence({ name: "Pedro", invites: 3, levels: 1 }), "Pedro can bring 3 people. Only people with a Resbite account.");
assert.equal(circleSentence({ name: "Pedro", invites: 0, levels: 2 }), "");
assert.deepEqual(circleOf({}), { invites: 0, levels: 1 });
assert.deepEqual(circleOf({ bring_invites: 2, bring_levels: 3 }), { invites: 2, levels: 3 });
assert.equal(firstName("Pedro Gómez"), "Pedro");
// circleSave: tap 2 while saving 1 → ignored; saved {1,2}, tap {2,2}, failed → shown {1,2}.
```

  `services/circle.test.ts`: `set` sends `set_plan_circle` with the three arguments; refusals are thrown as sent; the three `circleErrorMessage` cases.

- [ ] **Step 2: Run them to see them fail.** `cd mobile && node --import tsx src/domain/circle.test.ts` (and the two others). Expected: FAIL, modules missing.

- [ ] **Step 3: Implement.** Append the three tests to `package.json`.

- [ ] **Step 4: Run `npm run check`.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/design/CircleCard.tsx mobile/src/domain/circleCopy.ts mobile/src/domain/circleCopy.test.ts mobile/src/domain/circle.ts mobile/src/domain/circle.test.ts mobile/src/services/circle.ts mobile/src/services/circle.test.ts mobile/src/services/plans.ts mobile/src/domain/plans.ts mobile/app/invitations.tsx mobile/package.json
git commit -m "Circles of trust: the host sets the circle on Invite people"
```

### Task 4: "Bring someone" and bring mode

**Files:**
- Modify: `mobile/src/services/rsvp.ts:67,88-105` (`Guest` gains `broughtById: string | null` and `level: number`; `readGuests` selects `user_id,response,brought_by,level,profiles(display_name)`; missing values read as null and 1, since browser stubs and old caches lack them)
- Modify: `mobile/src/services/circle.ts`, `mobile/src/services/circle.test.ts`, `mobile/src/domain/circleCopy.ts`, `mobile/src/domain/circleCopy.test.ts`
- Modify: `mobile/src/state/useEvent.ts` (`:169` and the snapshot: allowance, the bringer's own links, `broughtNames`); `mobile/src/domain/eventPage.ts` (`bringRow`); `mobile/src/domain/eventPage.test.ts`; `mobile/app/event.tsx:353-357`
- Modify: `mobile/app/invitations.tsx` (bring mode); `mobile/src/state/useContactInvites.ts` (`limit`, `Message.inviter`); `mobile/src/domain/contactInvites.ts:126` (`inviteMessage` with `inviter`; `canPick`); `mobile/src/domain/contactInvites.test.ts`; `mobile/src/services/inviteSend.ts:34` (the message type takes `inviter`); `mobile/src/design/ContactPicker.tsx` and `mobile/src/design/ConnectionsPicker.tsx` (unpicked rows disabled at the cap); `mobile/src/state/useResend.ts` (the bringer's message); `mobile/src/domain/inviteCopy.ts:1` (export `joinNames`); `mobile/src/services/contactInvites.ts:33-38` (`inviteErrorMessage` words the two circle refusals) and `mobile/src/services/contactInvites.test.ts`

**Interfaces:**
- Consumes:
  - Task 1's `my_bring_allowance` and `plan_phone_invitations` (a bringer's own rows).
  - Plan 1's `ConnectionsPicker` and `useContactInvites`: `connections`, `chosenUsers`, `toggleUser`, `invitedUsers`, `inviteCount`. Numbers go first, in their own calls; then the connections, through `inviteConnections`.
  - `INVITE_COPY`, `inviteErrorMessage` (`mobile/src/services/contactInvites.ts:33`).
- Produces:
  - `CIRCLE_COPY` additions:
    - `bringSomeone: "Bring someone"` (the row and bring mode's title)
    - `bringHint: (host, n) => \`${host} trusts you to bring ${n === 1 ? "1 person" : \`${n} people\`}. They’re in, no approval needed.\``
    - `bringHintMore: (host, n) => \`${host} trusts you to bring ${n} more ${n === 1 ? "person" : "people"}. They’re in, no approval needed.\``
    - `youBrought: (names) => \`You brought ${joinNames(names)}\``
    - `bringLine: (host, n, title) => \`${host} trusts you to bring ${n === 1 ? "1 person" : \`${n} people\`} to ${title}.\``
    - `notAllowed: "You can’t bring anyone to this resbite now."`
    - `noneLeft: "You’ve used all your invites for this resbite."`
  - `circleGateway.allowance(planId): Promise<Allowance>`, where `Allowance = { allowed; used; remaining; level; mayBring }` comes from `my_bring_allowance`.
  - `inviteErrorMessage(e)` (`mobile/src/services/contactInvites.ts:33-38`) maps by message before code: 'Not allowed to bring people here' → `CIRCLE_COPY.notAllowed`, 'No invites left' → `CIRCLE_COPY.noneLeft`; everything else as today. The gateway's `failure()` (`:47-54`) already passes every refusal through it, so bring mode and a bringer's Send again (`useResend` calls the same gateway) show these lines. There is no separate `bringErrorMessage`.
  - `bringRow({ role, state, response, allowance, broughtNames, host }) → { kind: "bring"; hint } | { kind: "brought"; text } | null`:
    - Null unless `role === "guest"`, `state === "open"`, `response` is `accepted` or `maybe`, and `allowance?.mayBring`.
    - `"bring"` when `remaining > 0`, with `hint` = `used === 0 ? bringHint(host, allowed) : bringHintMore(host, remaining)`.
    - `"brought"` when `remaining === 0` and `broughtNames` is not empty, with `youBrought(broughtNames)`.
    - Otherwise null. `host` is the organizer's first name.
  - `useEvent`:
    - `readInvited` (`:169`) also runs for a non-host who has answered (any reply), listing their own links; a failure gives `[]`.
    - `allowance` is read only for a guest who is Going or Maybe on an open plan with `circleOf(plan).invites > 0`; otherwise, or on failure, null.
    - `broughtNames` is the first names of guests with `broughtById === userId` and response pending, accepted or maybe, then the names of the viewer's own unanswered links (stored name, else the formatted number).
  - `event.tsx`: right after `PeopleRow` (`:353-357`), before the chat plan's Chat row (CH-P14), either a row card or a text row:
    - The row card: `UserPlus`, title `bringSomeone`, the hint, and a chevron → `router.push({ pathname: "/invitations", params: { plan, bring: "1" } })`.
    - Or the `youBrought` text row, with no chevron, not a button.
  - **Bring mode of `/invitations`.** `bring=1` from a non-host. A host ignores it and gets host mode; a non-host without it still gets `hostsOnly`.
    - It reads the plan, `circleGateway.allowance`, the organizer's first name (`readProfile(plan.owner_id)`, else `INVITE_COPY.hostFallback`), the caller's own first name and the guests.
    - Title `bringSomeone`. When `mayBring && remaining > 0`: `bringLine(host, remaining, title)`, then `ConnectionsPicker` and `PickStep` with `limit = remaining`; no `CircleCard`, no `EventLinkCard`. Otherwise the line `notAllowed` (not `mayBring`) or `noneLeft`, and no picker.
    - A refused send shows `contacts.error`, worded by `inviteErrorMessage`; bring mode reloads the allowance whenever `contacts.error` becomes non-null.
    - The send step's message is `{ inviter: own first name, host: organizer's first name, title, when }`.
  - `inviteMessage({ inviter?, host, title, when, link })`: with `inviter`, `"${inviter} invited you to ${host}’s ${title}, ${when}. Reply here: ${link}"`; without it, today's text. `useContactInvites`' `Message` gains `inviter?: string`.
  - **The cap.** `canPick(count, limit, replacing)`, where `count` is `inviteCount` (numbers and connections together, `useContactInvites.ts:207`), returns true when `limit` is undefined, when `replacing` (the pick swaps the number of a contact already picked), or when `count < limit`.
    - `useContactInvites({ …, limit? })` applies it in `toggle`, `choose`, `addNumber` and `toggleUser` (`mobile/src/state/useContactInvites.ts:210-245`); `invite()` is unchanged.
    - At the cap, `ContactPicker` and `ConnectionsPicker` show unpicked rows as disabled (`accessibilityState.disabled`).
  - `useResend(plan, reload, bringing?: { organizer: string })`: when `bringing` is given, Send again's message is `{ inviter: own first name, host: organizer, … }`. Today `useResend.ts:83-90` puts the sender in `host`.

- [ ] **Step 1: Write the failing tests.**
  - `eventPage.test.ts`, the `bringRow` matrix:
    - host → null; guest pending → null.
    - Going, `{allowed 1, used 0, remaining 1, mayBring true}` → `"bring"`, `"Ana trusts you to bring 1 person. They’re in, no approval needed."`.
    - Going, used 1 of 2 → `"Ana trusts you to bring 1 more person. They’re in, no approval needed."`.
    - Going, used 1 of 1, `broughtNames ["Clara"]` (one link, no guest row) → `"You brought Clara"`.
    - `["Clara", "Martín"]` → `"You brought Clara and Martín"`.
    - `mayBring false` (Nobody, or past the last level) → null; ended → null.
  - `contactInvites.test.ts`:
    - `inviteMessage({ inviter: "Pedro", host: "Ana", title: "Board game night", when: "Thu 20 Nov 19:00", link })` → `"Pedro invited you to Ana’s Board game night, Thu 20 Nov 19:00. Reply here: <link>"`; without `inviter`, today's text.
    - `canPick(3, 3, false) === false`, `canPick(3, 3, true) === true`, `canPick(2, 3, false) === true`, `canPick(9, undefined, false) === true`.
  - `circleCopy.test.ts`: the new strings.
  - `services/circle.test.ts`: `allowance` calls `my_bring_allowance { p_plan }` and maps `may_bring`.
  - `services/contactInvites.test.ts`: `inviteErrorMessage({ code: "42501", message: "Not allowed to bring people here" }) === CIRCLE_COPY.notAllowed`; `{ code: "22023", message: "No invites left" }` → `CIRCLE_COPY.noneLeft`; `{ code: "42501", message: "Active plan owner required" }` → `INVITE_COPY.hostsOnly`; the gateway's `invite` refused with the first throws `Error(CIRCLE_COPY.notAllowed)`.

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.

- [ ] **Step 3: Implement.** Read the Expo v57 router docs for `useLocalSearchParams` typing of `bring`.

- [ ] **Step 4: Run `npm run check`.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/services/rsvp.ts mobile/src/services/circle.ts mobile/src/services/circle.test.ts mobile/src/domain/circleCopy.ts mobile/src/domain/circleCopy.test.ts mobile/src/state/useEvent.ts mobile/src/domain/eventPage.ts mobile/src/domain/eventPage.test.ts mobile/app/event.tsx mobile/app/invitations.tsx mobile/src/state/useContactInvites.ts mobile/src/domain/contactInvites.ts mobile/src/domain/contactInvites.test.ts mobile/src/services/inviteSend.ts mobile/src/design/ContactPicker.tsx mobile/src/design/ConnectionsPicker.tsx mobile/src/state/useResend.ts mobile/src/domain/inviteCopy.ts mobile/src/services/contactInvites.ts mobile/src/services/contactInvites.test.ts
git commit -m "Circles of trust: a trusted guest brings someone"
```

### Task 5: The chain on the people list

**Files:**
- Modify: `mobile/src/domain/eventPage.ts:11-100` (`EVENT_COPY` additions), `:224-236` (`peopleCounts` counts the host's brought links), `:295-317` (`PersonRow`), `:353-458` (`peopleGroups`), plus a new `sheetHead`; `mobile/src/domain/eventPage.test.ts`
- Modify: `mobile/app/guests.tsx` (`useResend` at `:91`, indent, labels, the list line, the sheet head at `:210`, the Remove dispatch at `:155-161`); `mobile/app/event.tsx:140` (`peopleCounts` gets `broughtLinks`); `mobile/src/state/useEvent.ts` (`bringerNames`, `broughtLinks`); `mobile/src/services/circle.ts`, `mobile/src/services/circle.test.ts`

**Interfaces:**
- Consumes:
  - Task 1's `plan_bringers`, `plan_brought_invitations`, `revoke_brought_invitation`, `withdraw_brought_invitation` and the widened `revoke_phone_invitation`.
  - Task 4's `Guest.broughtById` and `level`, and the bringer's own `invited`.
  - Task 3's `firstName`, Task 4's `useResend(…, bringing)`.
  - Plan 1's `peopleGroups` (`eventPage.ts:353`): the owner's "Hosting" row first under Going; group titles count every row shown.
- Produces:
  - `EVENT_COPY` additions:
    - `broughtBy: (name) => \`Brought by ${name}\``, `broughtByJoined: (name) => \`brought by ${name}\``, `broughtByYou: "brought by you"`
    - `broughtLabel: (name, bringer) => \`${name}, brought by ${bringer}\``
    - `numberEnding: (ending) => \`Number ending ••${ending}\``
  - `circleGateway` additions:
    - `bringers(planId): Promise<Record<string, string>>`
    - `broughtLinks(planId): Promise<BroughtLink[]>`, where `BroughtLink = { id, ending, country, broughtByName: string | null }`
    - `revokeBrought(planId, id)`, `withdraw(planId, userId)`
  - `useEvent`:
    - `bringerNames` is read where names show, landing when it arrives; a failure keeps the names already known (`{}` at first).
    - `broughtLinks` is read for hosts only; a failure gives `[]`.
  - `peopleGroups` gains the inputs `bringerNames` and `broughtLinks`. `PersonRow` gains `depth: 0 | 1 | 2 | 3`, `broughtByName: string | null` and `invitationId?: string`.
    - **Status.**
      - An answered guest whose bringer has a name → `broughtBy(name)`.
      - An unanswered row → its status joined by ` · ` to `broughtByJoined(name)` ("Invited in the app · brought by Pedro"), or to `broughtByYou` when the viewer brought them.
      - A bringer with no name (deleted, or not yet known) gets no words (rule 10).
    - **Order and depth.** In each group, a person sits right after their bringer when the bringer is in the same group, recursively. `depth` is the number of hops from the first person in the chain who is not brought, or whose bringer is not in the group; it is capped at 3. The owner's row stays first, at depth 0.
    - **The host's Invited group** adds the brought links: name `numberEnding(ending)`; status `"Invited by link"`, plus ` · brought by <name>` when named; `invitationId`; actions `["removeInvite"]` while open. There is no Send again: the host has no code.
    - **A guest who is not a host** gets an Invited group ("Invited, not answered yet") with only two kinds of row, both with actions only while open:
      - their own link rows (`invited`): status `<invited by…> · brought by you`, actions `sendAgain` when this phone stored the code, and `removeInvite`;
      - their own pending in-app rows (`broughtById === userId`): status "Invited in the app · brought by you", action `removeInvite`.
      - Every other pending row stays hidden from guests (UX2-D6).
  - `sheetHead(row): string | null`: for a brought row, `reply` and `broughtByJoined(name)` joined by ` · ` ("Going · brought by Pedro"); otherwise `status ?? reply`, as `guests.tsx:210` does today.
  - `guests.tsx`:
    - `:91` becomes `useResend(plan, event.load, role === "guest" ? { organizer: firstName(event.organizer ?? "") || INVITE_COPY.hostFallback } : undefined)`, so a bringer's Send again reads "Pedro invited you to Ana’s …".
    - Rows are indented by `16 * depth` of left padding (`8 * depth` under Larger Text), with a 2 pt left rule. A brought row with a named bringer is labelled `broughtLabel(name, bringer)`.
    - Hosts get `CIRCLE_COPY.listLine(invites, levels)` under the title when `circleOf(plan).invites > 0`.
    - Remove dispatches three ways: a row with `invitationId` → `circleGateway.revokeBrought`; an `appInvite` row, for a viewer who is not a host → `circleGateway.withdraw`; a `linkInvite` row → `contactInviteGateway.revoke`, as today (the server admits a bringer for their own rows).
  - `peopleCounts` gains optional `broughtLinks`, counted in the host's "N invited"; `event.tsx:140` passes them.

- [ ] **Step 1: Write the failing tests.**

```ts
test("brought people sit under their bringer, one step in per hop", () => {
  const guests = [g("ana"), g("pedro"), g("clara", { broughtById: "pedro", level: 2 }), g("martin", { broughtById: "clara", level: 3 }), g("marta")];
  const rows = peopleGroups({ …base, owner: { userId: "owner", name: "Owner" }, guests, bringerNames: { pedro: "Pedro", clara: "Clara" } }).find((x) => x.title.startsWith("Going")).rows;
  assert.deepEqual(rows.map((r) => [r.name, r.depth, r.status]), [["Owner", 0, null], ["Ana", 0, null], ["Pedro", 0, null], ["Clara", 1, "Brought by Pedro"], ["Martín", 2, "Brought by Clara"], ["Marta", 0, null]]);
});
test("removing the bringer moves the brought up and keeps the words", …) // no pedro row: Clara depth 0 "Brought by Pedro", Martín depth 1
test("a bringer whose account was deleted leaves no words", …)          // bringerNames lacks the id: status null, nesting by id kept
test("a bringer sees their own unanswered links and in-app invitees", …) // "Invited by WhatsApp · brought by you" ["sendAgain","removeInvite"]; "Invited in the app · brought by you" ["removeInvite"]; another guest's pending row absent
test("a host sees a bringer's link by its last digits", …)              // "Number ending ••23", "Invited by link · brought by Sol", invitationId, ["removeInvite"]; an app invitee "Invited in the app · brought by Pedro"
test("the sheet head says the answer and who brought them", …)           // sheetHead → "Going · brought by Pedro"
```

  `services/circle.test.ts`: the four calls' function names and arguments (`plan_bringers { p_plan }`, `plan_brought_invitations { p_plan }`, `revoke_brought_invitation { p_plan, p_invitation }`, `withdraw_brought_invitation { p_plan, p_user }`).

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run `npm run check`.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/domain/eventPage.ts mobile/src/domain/eventPage.test.ts mobile/app/guests.tsx mobile/app/event.tsx mobile/src/state/useEvent.ts mobile/src/services/circle.ts mobile/src/services/circle.test.ts
git commit -m "Circles of trust: the people list shows who brought whom"
```

### Task 6: The web page names the inviter

**Files:**
- Modify: `links/server/lib/personal.mjs:31-47,128-161`; `links/assets/personal-flow.mjs:91-96`; `links/assets/personal.js` (`:78-92`, `:152`, `:274`); `links/personal.test.mjs`; `links/personal-flow.test.mjs`; `links/verify-personal.mjs`

**Interfaces:**
- Consumes: Task 1's `inviter` key (open payload only; absent for a host's link and for a deletion-pending bringer).
- Produces:
  - `PERSONAL_WORDS.invitedBy: (inviter, host) => \`${inviter} invited you to ${firstWord(host)}’s resbite\``, where `firstWord` is the first word of the name: the host by first name, as rule 8 does for pushes. The first line is `invitedBy` when `data.inviter` is present, else `invited(host)` as today. The dot's initial is the inviter's. The page's other host lines keep `host` as the server sends it.
  - With an inviter, these name the inviter: `notYours(inviter)` ("Not your number? Ask Pedro to check it."), the `noscript` line "Ask Pedro for help if it is off.", `confirmBody(inviter)` and `wrongNumber(inviter)`. `hostSees`, `hostCanSee` and `nameHelper` keep the host.
  - `<main>` carries `data-inviter` only when there is one. `errorText(error, host, inviter = host)` gives `wrongNumber` the inviter.

- [ ] **Step 1: Write the failing tests.**
  - `personal.test.mjs`: `renderPersonalPage({ state: "open", host: "Ana Host", inviter: "Pedro", … })` contains `Pedro invited you to Ana’s resbite`, `Not your number? Ask Pedro to check it.` and `data-inviter="Pedro"`. Without `inviter`: `Ana Host invited you`, `Ask Ana Host to check it.`, and no `data-inviter`.
  - `personal-flow.test.mjs`: `errorText("wrongNumber", "Ana", "Pedro") === "That isn’t the number Pedro invited."`; `errorText("wrongNumber", "Ana") === "That isn’t the number Ana invited."`.
  - `verify-personal.mjs`: a second open code whose fixture returns `inviter: "Pedro"`. Expect the first line; after Answer, the confirm step reads "Type the number Pedro invited. We’ll text it a code."; a wrong number reads "That isn’t the number Pedro invited.".

- [ ] **Step 2: Run them to see them fail.** From `mobile/`: `node --test ../links/personal.test.mjs`, `node --import tsx ../links/personal-flow.test.mjs`, `node --import tsx ../links/verify-personal.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement.** Run the three again. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add links/server/lib/personal.mjs links/assets/personal-flow.mjs links/assets/personal.js links/personal.test.mjs links/personal-flow.test.mjs links/verify-personal.mjs
git commit -m "Circles of trust: the web page says who invited and who hosts"
```

### Task 7: Browser script, runbook, record

**Files:**
- Create: `mobile/scripts/verify-circle.mjs`, `qa/circles-of-trust-2026-11-10/README.md`
- Modify: `knowledge-base/08-decisions.md`, `docs/implementation-status.md`

**Interfaces:** none.

- [ ] **Step 1: Write `verify-circle.mjs`** on the fixture pattern of `verify-contact-invites.mjs` (its REST stub is at `:205-238`). The stub records the `select` of every `/rest/v1/plans` read, and drops `bring_invites` and `bring_levels` from the reply when the select lacks them (C-R5).
  - (a) **Host.** The fixture plan is saved at (1, 2).
    - Invite people shows "Circle of trust" with "1" and "2 levels" selected; the read's select contains `bring_invites,bring_levels`.
    - Tap "2" → `set_plan_circle {p_plan, p_invites: 2, p_levels: 2}`; tap "1" → `{…, p_invites: 1, p_levels: 2}`.
    - The sentence reads "Pedro can bring 1 person, and that person can bring 1 more. Only people with a Resbite account.".
    - A stubbed 22023 on the next tap → "Couldn’t save the circle. Try again." and the saved selection back.
  - (b) **Guest Pedro, Going,** with `my_bring_allowance` → `{allowed 1, used 0, remaining 1, level 1, may_bring true}`.
    - The resbite shows "Bring someone" with "Ana trusts you to bring 1 person. They’re in, no approval needed.".
    - Tap it → title "Bring someone", line "Ana trusts you to bring 1 person to Board game night.", no Event link, no circle card.
    - Tick one connection; a second is disabled. "Invite 1" → `invite_contacts` with one `{user}` item.
    - Back on the resbite, with the stub at used 1 and the guest carrying `brought_by` → "You brought Marta".
  - (c) **Guest Pedro, a phone contact in bring mode.** `invite_contacts` returns `link`; the WhatsApp URL's text is "Pedro invited you to Ana’s Board game night, <when>. Reply here: <link>".
  - (d) **Host, the people list.**
    - "Marta" right under "Pedro", with "Brought by Pedro" (from `plan_bringers`).
    - The line "Circle of trust: each person brings 1, two levels.".
    - A row "Number ending ••23" with "Invited by link · brought by Pedro", whose Remove calls `revoke_brought_invitation {p_plan, p_invitation}`.
  - (e) **Pedro's people list.** His link under "Invited, not answered yet", with "brought by you"; Send again on WhatsApp opens a URL whose text is "Pedro invited you to Ana’s Board game night, <when>. Reply here: <link>"; Remove → `revoke_phone_invitation`.

- [ ] **Step 2: Run it** with Expo web on 8081: `node scripts/verify-circle.mjs`. Expected: PASS.

- [ ] **Step 3: Write the runbook** in the house sections of `qa/creating-a-resbite-2026-10-31/README.md`.
  - The migration's and rollback's final sha256s.
  - **Rollback order:** chat 3, chat 2, chat 1, circles, follow-ups, connections, creating-a-resbite. Each step's guard refuses when run out of order, and the circles rollback refuses while chat is applied (C-R15) or once the follow-ups rollback has run. The follow-ups runbook's "run this first" predates circles; this runbook supersedes it.
  - **Order:**
    1. The migration. If the follow-ups migration is still pending, use one before/after snapshot pair, approve both files by name and sha256, and apply them in order.
    2. The sender redeploy (the `rsvp` wording); it may share the follow-ups' redeploy.
    3. The link-site deploy (recipe in `qa/phone-key-2026-10-29/README.md`).
    4. Only then the TestFlight build: the new build's `readGuests` selects `brought_by,level`, which fail on the old schema.
  - Advisors: expected no new finding.
  - The concurrency mutation run and its result (Task 1 Step 5).
  - The accepted risks and the owner question, copied from this plan.
  - Device checks:
    - Set the circle.
    - Bring a connection and a phone contact, on two phones.
    - Check the chain.
    - Remove the bringer.
    - The host removes a brought person; the bringer cannot bring them back.
    - The bringer takes back a link.

- [ ] **Step 4: Decisions and status entries.** In `knowledge-base/08-decisions.md`: CO-D4, D5, D7, CO-P7–P13, P15, and this plan's calls:
  - CO-P12 over CO-P8 for carried levels;
  - removals remembered per series;
  - a host sees a bringer's link by its last two digits;
  - a host's link takes over a bringer's;
  - the owner question.

  Then `docs/implementation-status.md`.

- [ ] **Step 5: Full check.**

```bash
bash scripts/test-database-docker.sh && (cd mobile && npm run check) && for f in supabase/functions/_shared/*.test.ts; do node --import ./mobile/node_modules/tsx/dist/loader.mjs "$f" || exit 1; done && (cd mobile && node --import tsx ../links/verify-personal.mjs)
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/scripts/verify-circle.mjs qa/circles-of-trust-2026-11-10/README.md knowledge-base/08-decisions.md docs/implementation-status.md
git commit -m "Circles of trust: the browser check, the runbook and the record"
```
