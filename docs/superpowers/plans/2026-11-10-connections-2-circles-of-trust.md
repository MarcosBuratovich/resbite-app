# Circles of Trust Implementation Plan (plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host sets how many people each guest may bring and how far that trust travels; a trusted guest brings a connection or a phone contact who joins without approval; the host sees who brought whom and can remove anyone.

**Architecture:** One hosted migration adds the two circle columns on `plans`, `brought_by` and `level` on `attendees` and `phone_invitations`, the allowance function, `set_plan_circle`, and lets `invite_contacts` admit a non-host whose allowance covers the batch; the answer, claim and roll functions carry `brought_by` and `level`; the web page learns who invited. The app gets the Circle of trust card on Invite people, the "Bring someone" row with a bring mode of Invite people, and the chain on the people list. The sender's `rsvp` copy says "· brought by Pedro".

**Tech Stack:** as plan 1, plus the link site (`links/`, Vercel, node tests).

**Spec:** `docs/superpowers/specs/2026-11-10-connections-and-circles-design.md` (CO-D4, CO-D5, CO-D7, CO-P7–P13, CO-P15, screens CO-04–CO-07; mockups `docs/superpowers/specs/2026-11-10-connections-groups-chat-mockups/circle-of-trust.html`).

**Branch:** `co2-circles-of-trust` from `main` after the follow-ups plan (`docs/superpowers/plans/2026-11-11-connections-3-follow-ups.md`) is merged. Plan 1 is merged and live (main `3e5d37f`, hosted migration `20261110120000`).

## Revised 11 November 2026, after plan 1 shipped

Plan 1's execution changed interfaces this plan names. Where the tasks below and this section differ, this section wins.

- **Migration name:** `supabase/migrations/20261111130000_circles_of_trust.sql` (after the follow-ups' `20261111120000`), not `20261110130000`.
- **Where each redefined function's latest body lives** (copy from there, change only what the task says):
  - `invite_contacts`: `20261110120000_connections.sql:321`. It already takes `{user}` items, which need a `connected` pair plus `user_eligible` and not `deletion_pending`, and fail the whole call with `42501 'Not a connection'`. It opens with `v_uid uuid := private.require_link_owner(p_plan)`. Replace that line with `v_uid := private.require_tester()`, followed by a branch. A host still goes through `private.require_link_owner(p_plan)`. A non-host takes the plan row `for update`, then the allowance check. The advisory lock and the `charge_lookup` call (phone items only) stay for both.
  - `answer_phone_invitation`: `20261031120000_creating_a_resbite.sql:304`.
  - `personal_invitation_page`: `20261031120000_creating_a_resbite.sql:266`.
  - `plan_phone_invitations`: `20261031120000_creating_a_resbite.sql:653`.
  - `claim_invite`: `20261031120000_creating_a_resbite.sql:121`.
  - `decide_join_request`: `20261029120000_open_link_approval.sql:225`.
  - `roll_repeating_plans`: the follow-ups migration's version, which carries every guest row (CH-P20). Copy it from `20261111120000_connections_follow_ups.sql`, not from creating-a-resbite.
  - `claim_notification_deliveries`: `20261030120000_push_delivery.sql:101`.
- **The app as it stands.**
  - `Guest` is `{ userId, name, response }` (`mobile/src/services/rsvp.ts:67`); `readGuests` selects at `:92`.
  - `peopleGroups` (`mobile/src/domain/eventPage.ts:353`) takes `owner`, `userId` and `connections`. It puts the owner's "Hosting" row first under Going, and its group titles count every row shown (Ruling 21).
  - The chain nesting of Task 5 keeps the owner's row first. The owner is never "brought", so the owner row has `depth 0`.
- **Invite people as it stands.**
  - `ConnectionsPicker` (`mobile/src/design/ConnectionsPicker.tsx`) sits above `PickStep`.
  - `useContactInvites` returns `connections`, `chosenUsers`, `toggleUser`, `invitedUsers` and `inviteCount`.
  - `inviteItems(selected, chosenUsers, invitedUsers, codeFor)` returns `{ numbers, phones, users }`.
  - The numbers go first, in their own calls. The connections go in calls of their own through `inviteConnections`, which retries a refused batch one by one.
  - Bring mode's `limit` caps `inviteCount` (numbers plus connections together). The server checks the allowance under the plan lock in each call, so the phone call and the connections call cannot together exceed it.
- **Page order.** The "Bring someone" row goes right after the people row. The chat plan's Chat row goes after it (CH-P14).
- **The CO-P2 group exception** (anyone on a group may be asked) is the chat plan's, not this one's.
- **Commands on this machine:** edge tests run with `node --import ./mobile/node_modules/tsx/dist/loader.mjs supabase/functions/_shared/<file>.test.ts` from the repo root (Node here lacks `--experimental-transform-types`). After new screens land in a checkout, start Expo once (`npx expo start --web --port 8081`, stop it by its process group) before `npm run typecheck`: the typed-route file is generated and git-ignored.
- **Runbook steps that changed:** apply this migration together with the follow-ups' one if both are pending (one before/after snapshot pair, two files approved by name and sha256, applied in order); the sender redeploy (Task 2's `rsvp` wording) can share the follow-ups' redeploy.

## Global Constraints

Same as plan 1, verbatim: no hosted touch in this plan; the house function and table shapes and error codes; rollback and hosted-baseline files with both harness modes green; pushes through the outbox with UX2-D4 wording; copy in `*Copy.ts` with exact-string tests and every new test appended to `mobile/package.json`; `npm run check` green; Expo v57 docs first; UX2-D6 names rule; 44 pt and labels; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; commit per task, never push. Plus: the link site is generated with `node --import ./mobile/node_modules/tsx/dist/loader.mjs links/generate.mjs …` and checked with `links/*.test.mjs` and `links/verify-personal.mjs`; deploying it is an owner-approved rollout step, not part of this plan.

## Review Focus

1. **Two phones spend the last invite at once.** Expected: one succeeds, the other gets `22023 'No invites left'`, and exactly one person is added. Test in Task 1 (concurrency script).
2. **The bringer drops out after sending.** Expected: Clara's unanswered link still works and she joins without approval; Pedro's Can't go, removal or a lowered circle change nothing for her (CO-P15). Test in Task 1.
3. **Level arithmetic at the edge.** Expected: with "2 levels", a level-2 person may bring, a level-3 person gets `42501 'Not allowed to bring people here'`; with "Nobody", everyone gets it; a host never needs the circle. Test in Task 1.
4. **The next Thursday.** Expected: the roll copies the circle numbers and each carried person's `brought_by` and `level`, so Pedro's allowance on the new occurrence already counts Clara. Test in Task 1.
5. **Removing the bringer.** Expected: Clara and Martín stay, keep "Brought by", and the host's list shows them one step up. Test in Task 5 (grouping) and Task 1 (rows untouched).

---

### Task 1: Migration: columns, allowance, bringing on the server

**Files:**
- Create: `supabase/migrations/20261111130000_circles_of_trust.sql`
- Create: `supabase/tests/circles-of-trust.sql`, `supabase/tests/local/circles-concurrency.sh`
- Create: `supabase/rollback/20261111130000_circles_of_trust.rollback.sql`, `supabase/tests/hosted-baseline/20261111130000_circles_of_trust.before.sql`, `.after.sql`

**Interfaces:**
- Consumes: plan 1's `invite_contacts` (with `{user}` items), `private.require_link_owner`, `private.is_host`, `private.plan_end`, `private.answer_phone_invitation` (`20261031120000_creating_a_resbite.sql:304`), `private.claim_invite` (`:120`), `private.decide_join_request` (`20261029120000_open_link_approval.sql:225`), `private.roll_repeating_plans` (`:1006`), `private.personal_invitation_page` (`20261028120000_contact_invitations.sql:197`), the concurrency script shape of `supabase/tests/local/*-concurrency.sh`.
- Produces:
  - `public.plans.bring_invites smallint not null default 0 check (bring_invites between 0 and 3)`, `public.plans.bring_levels smallint not null default 1 check (bring_levels between 1 and 3)`.
  - `public.attendees.brought_by uuid null references public.profiles(id)`, `public.attendees.level smallint not null default 1 check (level between 1 and 4)`; `private.phone_invitations.level smallint not null default 1` (the level the answerer gets; 1 for a host's link, bringer's level + 1 for a guest's).
  - `public.set_plan_circle(p_plan uuid, p_invites smallint, p_levels smallint) returns integer` (the new `plans.version`): `require_link_owner`; plan open; values in range else `22023 'Invalid circle'`; no notices.
  - `private.bring_allowance(p_plan uuid, p_user uuid) returns table (allowed smallint, used smallint, level smallint, may_bring boolean)` per CO-P8/CO-P10: hosts → `level 0, may_bring false`; attendee row required else `may_bring false`; `may_bring := plan active and plan_end > now() and response in ('accepted','maybe') and bring_invites > 0 and level <= bring_levels and used < allowed`; `used` = attendee rows with `brought_by = p_user` and `response in ('pending','accepted','maybe')` + `phone_invitations` with `invited_by = p_user`, `revoked_at is null`, `answered_at is null` (`user_id is null`).
  - `public.my_bring_allowance(p_plan uuid) returns jsonb` → `{allowed, used, level, may_bring}` for the caller (`42501 'Not invited'` for a stranger).
  - `invite_contacts`: a caller who is not a host is admitted when `bring_allowance(p_plan, caller).may_bring`, inside the existing advisory lock plus `select … from public.plans where id = p_plan for update`; the count of *new* invitations in the batch (items that will create a pending row or a new phone invitation) must fit in `allowed - used` else `22023 'No invites left'`; a non-host whose `may_bring` is false gets `42501 'Not allowed to bring people here'`. New attendee rows get `brought_by = caller` and `level = caller level + 1` when the caller is not a host (null and 1 for hosts); new phone invitations get `invited_by = caller` and `level = caller level + 1` (1 for hosts). A non-host's `{user}` item must still be a connection of the caller (plan 1).
  - `answer_phone_invitation`, `claim_invite`, `decide_join_request`: when inserting the attendee row, `brought_by := case when private.is_host(plan, invited_by) then null else invited_by end`, `level := phone_invitations.level` (answer), `1` (claim, decide).
  - `roll_repeating_plans`: copies `bring_invites`, `bring_levels` into the new plan and `brought_by`, `level` into the carried rows.
  - `personal_invitation_page`: adds `"inviter": <first name>` when `invited_by` is not a host of the plan (else omitted) and `"host"` as today.
  - `remove_guest`: unchanged (a removed bringer's brought people keep `brought_by`; nothing cascades).

- [ ] **Step 1: Write the failing SQL test** (`circles-of-trust.sql`, prefix `g1`: owner 01, guests 02 Going, 03 Maybe, 04 pending, 05 Can't go; connections 02↔06, 02↔07, 03↔08 inserted directly as `connected`; phone users 09, 10 for links)

```sql
-- set_plan_circle(plan, 1, 2) by 01: version bumps; by 02: 42501. (plan, 4, 1): 22023 'Invalid circle'.
-- bring_allowance: 01 → level 0, may_bring false. 02 (Going, level 1) → allowed 1, used 0, may_bring true. 03 (Maybe) → true. 04 (pending) → false. 05 (Can't go) → false.
-- 02 invites {user: 06}: kind 'app'; attendees(plan, 06) has brought_by 02, level 2; allowance(02).used = 1, may_bring false.
-- 02 invites {user: 07}: 22023 'No invites left'. 04 invites {user: x}: 42501 'Not allowed to bring people here'.
-- 06 (level 2, pending) answers accepted via respond; allowance(06).may_bring true (levels 2). 06 invites a phone contact (item phone 4477…09, code): kind 'link'; phone_invitations row has invited_by 06, level 3.
-- 09 answers that link (answer_phone_invitation as 09, accepted): attendees(plan, 09) brought_by 06, level 3; allowance(09).may_bring false (level 3 > 2 levels): 09 invites → 42501.
-- Circle lowered: set_plan_circle(plan, 0, 1); 06 invites another → 42501; 02's earlier link to 10 (sent before lowering, insert it) still answers: 10 joins with brought_by 02 (CO-P15).
-- Bringer drops: 02 responds withdrawn; 10's row untouched; 06's row untouched; remove_guest(plan, 02) by 01: 06 and 10 keep brought_by = 02.
-- Freed slot: set circle back to (1, 2); 03 brings {user: 08} ('app'); 08 declines; allowance(03).used = 0; 03 brings again by phone: ok.
-- A host's own invitation: 01 invites {user: 06} on another plan: brought_by null, level 1.
-- personal_invitation_page for 06's link: inviter 'Guest …' (first name) and host 'Owner'; for a host's link: no inviter key.
-- Roll: make the plan repeat weekly, end it, call private.roll_repeating_plans() as superuser; the new plan has bring_invites 1, bring_levels 2; carried rows keep brought_by and level; allowance(02 on the new plan).used counts the carried 10.
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash scripts/test-database-docker.sh`. Expected: FAIL `function public.set_plan_circle(uuid, smallint, smallint) does not exist`.

- [ ] **Step 3: Write the migration**

Columns, `set_plan_circle`, `bring_allowance`, `my_bring_allowance`, then `create or replace` of `invite_contacts`, `answer_phone_invitation`, `claim_invite`, `decide_join_request`, `roll_repeating_plans`, `personal_invitation_page`, each copied from its latest definition with only the changes in Interfaces. Grants per the house shape.

- [ ] **Step 4: Run the test to see it pass**

Run: `bash scripts/test-database-docker.sh`. Expected: PASS.

- [ ] **Step 5: The concurrency script**

`supabase/tests/local/circles-concurrency.sh` in the shape of the existing `*-concurrency.sh`: two `psql` sessions as guest 02 with one invite left, each calling `invite_contacts` with a different connection at the same time (`select pg_sleep(0.2)` before commit in one); expect one `app` result and one `22023 'No invites left'`, and exactly one new attendee row. Run: `bash scripts/test-database-docker.sh` (full mode runs the `local/*-concurrency.sh` scripts). Expected: PASS.

- [ ] **Step 6: Rollback, hosted-baseline files, both modes**

Rollback drops the functions back to their plan-1 or earlier bodies and the columns (header comment: people already brought stay as ordinary guests; the circle numbers are lost). `before.sql`: `bring_invites` absent; `after.sql`: present with default 0, `set_plan_circle` granted to `authenticated`. Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261111130000_circles_of_trust.sql`. Expected: PASS. Note the migration's `sha256sum` for Task 7.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261111130000_circles_of_trust.sql supabase/tests/circles-of-trust.sql supabase/tests/local/circles-concurrency.sh supabase/rollback/20261111130000_circles_of_trust.rollback.sql supabase/tests/hosted-baseline/20261111130000_circles_of_trust.*.sql
git commit -m "Circles of trust: the numbers, the allowance, and bringing someone on the server"
```

### Task 2: "· brought by Pedro" in the host's push

**Files:**
- Modify: `supabase/migrations/20261111130000_circles_of_trust.sql` (append: `claim_notification_deliveries` returns `brought_by_name`), `supabase/tests/circles-of-trust.sql` (one assertion), `supabase/rollback/…` (restore the claim)
- Modify: `supabase/functions/_shared/notification-engine.ts:4-20` (`Delivery.brought_by_name?: string | null`), `supabase/functions/_shared/notification-copy.ts:44-64` (`CopyInput.brought_by_name`, the `rsvp` case), `notification-copy.test.ts`

**Interfaces:**
- Consumes: `public.claim_notification_deliveries` (`20261030120000_push_delivery.sql:101-145`): the jsonb it returns per delivery.
- Produces: each claimed row carries `brought_by_name` (first word of the bringer's `display_name` when the actor's attendee row on the plan has `brought_by`, else null); `notificationCopy` for `rsvp` appends ` · brought by <name>` to the body when present: `"Clara is going. · brought by Pedro"` becomes, exactly, `"Clara is going · brought by Pedro."` (the sentence's full stop moves to the end).

- [ ] **Step 1: Write the failing tests**

Copy test: `notificationCopy({ kind: "rsvp", detail: "accepted", title: "Board game night", actor_name: "Clara", brought_by_name: "Pedro" })` → `{ title: "Board game night", body: "Clara is going · brought by Pedro." }`; without the field, unchanged `"Clara is going."`. SQL: after 10 joins (Task 1), claim deliveries as the sender role the push-delivery test uses and assert the `rsvp` row for the owner has `brought_by_name = 'Guest'` (02's first name).

- [ ] **Step 2: Run to see them fail.** Edge: `cd supabase/functions && node --experimental-transform-types --test _shared/*.test.ts`; SQL: `bash scripts/test-database-docker.sh`. Expected: FAIL.

- [ ] **Step 3: Implement**, run both again (PASS), re-run the hosted-baseline mode (PASS), refresh the sha256 for Task 7.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261111130000_circles_of_trust.sql supabase/tests/circles-of-trust.sql supabase/rollback/20261111130000_circles_of_trust.rollback.sql supabase/functions/_shared
git commit -m "Circles of trust: the host hears who brought whom"
```

### Task 3: The Circle of trust card on Invite people

**Files:**
- Create: `mobile/src/design/CircleCard.tsx`, `mobile/src/domain/circleCopy.ts`, `mobile/src/domain/circleCopy.test.ts`, `mobile/src/domain/circle.ts`, `mobile/src/domain/circle.test.ts`, `mobile/src/services/circle.ts`, `mobile/src/services/circle.test.ts`
- Modify: `mobile/app/invitations.tsx` (the card above `ConnectionsPicker`, hosts only, plan open), `mobile/src/domain/plans.ts` (the `Plan` type gains `bring_invites: 0|1|2|3`, `bring_levels: 1|2|3`; the `planWithDetails` select in `mobile/src/services/rsvp.ts` adds both columns), `mobile/package.json`

**Interfaces:**
- Consumes: `Plan`, `IconButton`, the kit's `Segmented` (two or three options; the four-option "Each person can bring" needs the kit's segmented to accept four, or two rows of chips: check `mobile/src/design/kit.tsx`; if `Segmented` is capped at three, use four `Chip`s in a radiogroup), `useFocusedRefresh`.
- Produces:
  - `CIRCLE_COPY`: `heading: "Circle of trust"`, `hint: "Let the people you invite bring someone you don't know. Whoever they bring is in, without your OK."`, `eachBrings: "Each person can bring"`, `nobody: "Nobody"`, `howFar: "How far it goes"`, `levels: (n) => \`${n} level${n === 1 ? "" : "s"}\``, `accountsOnly: "Only people with a Resbite account."`, `summary: (invites, levels) => \`Circle of trust: ${invites} each, ${levels === 1 ? "one level" : levels === 2 ? "two levels" : "three levels"}.\``, `saveFailed: "Couldn't save the circle. Try again."`.
  - `circleSentence({ name, invites, levels })` in `circle.ts`: `invites === 0` → `""`; `levels === 1` → `"${name} can bring ${people(invites)}. ${accountsOnly}"`; `levels === 2` → `"${name} can bring ${people(invites)}, and ${those(invites)} can bring ${invites} more. ${accountsOnly}"`; `levels === 3` → `"${name} can bring ${people(invites)}, and each of them can bring ${invites} more, and so on for 3 levels. ${accountsOnly}"`, with `people(1) = "1 person"`, `people(n) = "${n} people"`, `those(1) = "that person"`, `those(n) = "each of them"`; `name` is the first Going guest's first name or `"Each guest"`.
  - `circleGateway.set(planId, invites, levels): Promise<number>` calling `set_plan_circle` with `{ p_plan, p_invites, p_levels }`; `circleErrorMessage(e)`: `42501` → `INVITE_COPY.hostsOnly`; `22023` → `CIRCLE_COPY.saveFailed`; else `INVITE_COPY.offline`.
  - `CircleCard({ plan, firstGuest, onSaved })`: the card of CO-04; each tap saves at once; the previous value is restored on failure with `saveFailed` under the card; after the end, or for a guest, not rendered (callers decide).

- [ ] **Step 1: Write the failing tests**

`circleCopy.test.ts` (exact strings), `circle.test.ts`:
```ts
assert.equal(circleSentence({ name: "Pedro", invites: 1, levels: 2 }), "Pedro can bring 1 person, and that person can bring 1 more. Only people with a Resbite account.");
assert.equal(circleSentence({ name: "Each guest", invites: 2, levels: 3 }), "Each guest can bring 2 people, and each of them can bring 2 more, and so on for 3 levels. Only people with a Resbite account.");
assert.equal(circleSentence({ name: "Pedro", invites: 3, levels: 1 }), "Pedro can bring 3 people. Only people with a Resbite account.");
assert.equal(circleSentence({ name: "Pedro", invites: 0, levels: 2 }), "");
```
`circle.test.ts` (services): `set` sends `set_plan_circle` with the three arguments; refusals thrown as sent; `circleErrorMessage` cases.

- [ ] **Step 2: Run to see them fail.** `cd mobile && node --import tsx src/domain/circle.test.ts` etc. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**, append the three tests to `package.json`, render the card in `invitations.tsx` when `canEditPlan(plan, userId)` (it already imports `canEditPlan`) and the plan is open; pass `firstGuest` from `readGuests` (the hosts' guests read of plan 1's Task 8, first `accepted` row).

- [ ] **Step 4: Run `npm run check`.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/design/CircleCard.tsx mobile/src/domain/circleCopy.ts mobile/src/domain/circleCopy.test.ts mobile/src/domain/circle.ts mobile/src/domain/circle.test.ts mobile/src/services/circle.ts mobile/src/services/circle.test.ts mobile/app/invitations.tsx mobile/src/domain/plans.ts mobile/src/services/rsvp.ts mobile/package.json
git commit -m "Circles of trust: the host sets the circle on Invite people"
```

### Task 4: "Bring someone" and bring mode

**Files:**
- Modify: `mobile/src/state/useEvent.ts` (read `my_bring_allowance` for guests; expose `allowance: { allowed, used, level, mayBring } | null`, `broughtNames: string[]`), `mobile/src/domain/eventPage.ts` (`bringRow(i)`), `mobile/src/domain/eventPage.test.ts`, `mobile/app/event.tsx:353-357` (the row after `PeopleRow`)
- Modify: `mobile/app/invitations.tsx` (`?bring=1`), `mobile/src/state/useContactInvites.ts` (`limit?: number`: `toggle`/`toggleUser` refuse past the limit; `invite()` unchanged), `mobile/src/design/ContactPicker.tsx` and `ConnectionsPicker.tsx` (the Invite button says at most `limit`), `mobile/src/services/inviteSend.ts` and `mobile/src/domain/contactInvites.ts` (`inviteMessage` gains an optional `inviter`: `"${inviter} invited you to ${host}'s ${title}, ${when}. Reply here: ${link}"`), `mobile/src/domain/contactInvites.test.ts`, `mobile/src/domain/circleCopy.ts` (+ `bringSomeone: "Bring someone"`, `bringHint: (host, n) => \`${host} trusts you to bring ${n === 1 ? "1 person" : \`${n} people\`}. They're in, no approval needed.\``, `bringHintMore: (host, n) => \`${host} trusts you to bring ${n} more.\``, `youBrought: (names) => \`You brought ${joinNames(names)}\``, `bringTitle: "Bring someone"`, `bringLine: (host, n, title) => \`${host} trusts you to bring ${n === 1 ? "1 person" : \`${n} people\`} to ${title}.\``)

**Interfaces:**
- Consumes: plan 1's `ConnectionsPicker` and `useContactInvites`; `my_bring_allowance`; `INVITE_COPY`.
- Produces:
  - `bringRow({ role, state, response, allowance, broughtNames, host }) → { kind: "bring"; hint: string } | { kind: "brought"; text: string } | null`. Rules, in order: `null` when `role !== "guest"`, when `state !== "open"`, when `response` is not `accepted` or `maybe`, or when `allowance` is null; `"bring"` when `allowance.mayBring` (the server has already applied Nobody, the level limit and the count); `"brought"` when `!allowance.mayBring && allowance.allowed > 0 && broughtNames.length > 0`; else `null`. `hint` is `bringHint(host, allowed)` when `used === 0`, else `bringHintMore(host, allowed - used)`; `text` is `youBrought(broughtNames)`.
  - `Guest` (`mobile/src/services/rsvp.ts`) gains `broughtBy: string | null` and `level: number`; `readGuests` selects `user_id,response,brought_by,level,profiles(display_name)`.
  - `event.tsx`: the row card after `PeopleRow` with `UserPlus`, title `bringSomeone`, the hint, chevron → `router.push({ pathname: "/invitations", params: { plan, bring: "1" } })`; or the `youBrought` text row with no chevron.
  - Bring mode of `/invitations`: title `bringTitle`, line `bringLine(host, remaining, title)`, `ConnectionsPicker` and `PickStep` with `limit = remaining`, no `CircleCard`, no `EventLinkCard`; the send step's message uses `inviter` = the guest's own name and `host` = the organizer's.
  - `useEvent.broughtNames`: first names of guests whose `brought_by === userId` (needs `brought_by` in `readGuests`' select, Task 5 adds it; here read it too, in the same change to `rsvp.ts`).

- [ ] **Step 1: Write the failing tests**

`eventPage.test.ts`: the `bringRow` matrix (host → null; guest pending → null; Going with `mayBring` → `"bring"` with `"Ana trusts you to bring 1 person. They're in, no approval needed."`; Going, used 1 of 2 → `"Ana trusts you to bring 1 more."`; Going, used 1 of 1, brought ["Clara"] → `"You brought Clara"`; ended → null). `contactInvites.test.ts`: `inviteMessage({ inviter: "Pedro", host: "Ana", title: "Board game night", when: "Thu 20 Nov 19:00", link })` → `"Pedro invited you to Ana's Board game night, Thu 20 Nov 19:00. Reply here: <link>"`; without `inviter`, today's text. A hook helper test: `toggle` refuses the fourth pick when `limit = 3` (export a pure `canPick(count, limit)`).

- [ ] **Step 2: Run to see them fail.** Expected: FAIL.

- [ ] **Step 3: Implement** (read the Expo v57 router docs for `useLocalSearchParams` typing of `bring`).

- [ ] **Step 4: Run `npm run check`.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/state/useEvent.ts mobile/src/domain/eventPage.ts mobile/src/domain/eventPage.test.ts mobile/app/event.tsx mobile/app/invitations.tsx mobile/src/state/useContactInvites.ts mobile/src/design/ContactPicker.tsx mobile/src/design/ConnectionsPicker.tsx mobile/src/services/inviteSend.ts mobile/src/domain/contactInvites.ts mobile/src/domain/contactInvites.test.ts mobile/src/domain/circleCopy.ts mobile/src/domain/circleCopy.test.ts mobile/src/services/rsvp.ts
git commit -m "Circles of trust: a trusted guest brings someone"
```

### Task 5: The chain on the people list

**Files:**
- Modify: `mobile/src/domain/eventPage.ts:304-381` (`peopleGroups` nests; `Guest.broughtBy` and `level` come from Task 4), `mobile/src/domain/eventPage.test.ts`, `mobile/app/guests.tsx` (indent + status), `mobile/src/state/useEvent.ts` (`readInvited` also for a bringer: the rows with `invited_by = me`; needs `plan_phone_invitations` to return a bringer's own rows: add that to the migration in Task 1 if not already: `plan_phone_invitations(p_plan)` admits a non-host and returns only rows with `invited_by = caller`), `mobile/src/domain/eventPage.ts` copy (`EVENT_COPY.broughtBy: (name) => \`Brought by ${name}\``, `broughtByYou: "brought by you"`, `circleLine: (summary) => summary`)

**Interfaces:**
- Consumes: Task 1's columns, plan 1's `peopleGroups` signature.
- Produces:
  - `PersonRow` gains `depth: 0 | 1 | 2 | 3` and `status` for brought people `broughtBy(firstName)` (joined with ` · ` to any existing status, e.g. `"Invited by WhatsApp · brought by Sol"`).
  - `peopleGroups` orders each group so that a person brought by someone in the same group sits right after their bringer (recursively), `depth` = hops from a person who is not brought (or whose bringer is not in this group); a brought person whose bringer is absent (removed, other group) gets `depth 0` but keeps the status line.
  - `guests.tsx`: `depth` renders as left padding of `16 * depth` with a 2 pt rule, and the accessibility label reads `"Clara, brought by Pedro"`.
  - A bringer (guest) sees an "Invited, not answered yet" group with only their own unanswered links (`Send again`, `Remove`), status `"Invited by WhatsApp · brought by you"`.
  - The list's first line for hosts: `CIRCLE_COPY.summary(invites, levels)` when `bring_invites > 0`.

- [ ] **Step 1: Write the failing tests**

```ts
test("brought people sit under their bringer, one step in per hop", () => {
  const guests = [g("ana"), g("pedro"), g("clara", { broughtBy: "pedro", level: 2 }), g("martin", { broughtBy: "clara", level: 3 }), g("marta")];
  const rows = peopleGroups({ …owner, guests }).find((x) => x.title.startsWith("Going")).rows;
  assert.deepEqual(rows.map((r) => [r.name, r.depth, r.status]), [["Ana", 0, null], ["Pedro", 0, null], ["Clara", 1, "Brought by Pedro"], ["Martín", 2, "Brought by Clara"], ["Marta", 0, null]]);
});
test("removing the bringer moves the brought up but keeps the words", …) // without pedro: Clara depth 0 status "Brought by Pedro", Martín depth 1.
test("a bringer's own unanswered links appear for them with 'brought by you'", …)
```

- [ ] **Step 2: Run to see it fail.** Expected: FAIL.

- [ ] **Step 3: Implement**, including the `plan_phone_invitations` change in the migration (append; re-run both harness modes; refresh the sha256).

- [ ] **Step 4: Run `npm run check` and `bash scripts/test-database-docker.sh`.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/domain/eventPage.ts mobile/src/domain/eventPage.test.ts mobile/app/guests.tsx mobile/src/state/useEvent.ts supabase/migrations/20261111130000_circles_of_trust.sql supabase/tests/circles-of-trust.sql supabase/rollback/20261111130000_circles_of_trust.rollback.sql
git commit -m "Circles of trust: the people list shows who brought whom"
```

### Task 6: The web page names the inviter

**Files:**
- Modify: `links/server/lib/personal.mjs:30-45,140-160` (`PERSONAL_WORDS.invitedBy: (inviter, host) => \`${inviter} invited you to ${host}'s resbite\``, rendered when `data.inviter` is present, else `invited(host)` as today; `notYours` keeps the host), `links/personal.test.mjs` (or the test file that covers `renderPersonalPage`), `links/verify-personal.mjs` (a fixture invitation with `inviter: "Pedro"`)

**Interfaces:**
- Consumes: Task 1's `personal_invitation_page` `inviter` key.
- Produces: the page's first line reads "Pedro invited you to Ana's resbite" for a brought person.

- [ ] **Step 1: Write the failing test**: `renderPersonalPage({ state: "open", host: "Ana", inviter: "Pedro", … })` contains `Pedro invited you to Ana&#39;s resbite`; without `inviter`, `Ana invited you`. Extend `verify-personal.mjs`'s fixture with a second open code whose page returns `inviter` and assert the line.

- [ ] **Step 2: Run to see it fail.** `cd mobile && node --import tsx ../links/personal.test.mjs` (or the file's actual name) and `node --import tsx ../links/verify-personal.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement.** - [ ] **Step 4: Run both again.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add links/server/lib/personal.mjs links/*.test.mjs links/verify-personal.mjs
git commit -m "Circles of trust: the web page says who invited and who hosts"
```

### Task 7: Browser script, runbook, record

**Files:**
- Create: `mobile/scripts/verify-circle.mjs`
- Create: `qa/circles-of-trust-2026-11-10/README.md`
- Modify: `knowledge-base/08-decisions.md` (CO-D4, D5, D7, CO-P7–P13, P15), `docs/implementation-status.md`

**Interfaces:** none.

- [ ] **Step 1: Write `verify-circle.mjs`** on the fixture pattern of `verify-contact-invites.mjs`: (a) as the host: open Invite people, see "Circle of trust", tap "1" then "2 levels", expect `set_plan_circle` called with `{ p_plan, p_invites: 1, p_levels: 2 }` twice (1,1 then 1,2) and the sentence "… can bring 1 person, and that person can bring 1 more. Only people with a Resbite account."; (b) as a Going guest with `my_bring_allowance` → `{allowed 1, used 0, level 1, may_bring true}`: the resbite page shows "Bring someone" with "Ana trusts you to bring 1 person. They're in, no approval needed."; tap it; the title is "Bring someone", no Event link; pick a second connection → the second tick is refused; tap "Invite 1"; expect `invite_contacts` with one `{user}` item; back on the resbite the row reads "You brought Marta" (stub the allowance as used 1 and the guests with `brought_by`); (c) as the host: the people list shows "Marta" under "Pedro" with "Brought by Pedro".

- [ ] **Step 2: Run it** with Expo web on 8081: `node scripts/verify-circle.mjs`. Expected: PASS.

- [ ] **Step 3: Runbook** in the house sections, with the migration's final sha256, the sender redeploy (rsvp copy), the link-site deploy recipe from `qa/phone-key-2026-10-29/README.md`, the TestFlight note and the device checks (set the circle, bring a connection and a contact on two phones, the chain, remove the bringer).

- [ ] **Step 4: Decisions and status entries.** - [ ] **Step 5: Full check**: `bash scripts/test-database-docker.sh && (cd mobile && npm run check) && (cd supabase/functions && node --experimental-transform-types --test _shared/*.test.ts) && (cd mobile && node --import tsx ../links/verify-personal.mjs)`. Expected: PASS ×4.

- [ ] **Step 6: Commit**

```bash
git add mobile/scripts/verify-circle.mjs qa/circles-of-trust-2026-11-10/README.md knowledge-base/08-decisions.md docs/implementation-status.md
git commit -m "Circles of trust: the browser check, the runbook and the record"
```
