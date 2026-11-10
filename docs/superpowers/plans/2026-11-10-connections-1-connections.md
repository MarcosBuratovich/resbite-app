# Connections Implementation Plan (plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two people who share a resbite can connect (request and accept), see each other under Connections, and invite each other inside the app from Invite people.

**Architecture:** One hosted migration adds `public.connections` and `private.connection_refusals`, the five connection functions, two read functions, the two outbox kinds and the `{user}` item of `invite_contacts`. The sender gets the two copies and a `connection` payload type; the app routes that type to a new `/connections` screen. The people list grows a three-dots sheet for everyone with the connection action; Invite people grows a "Your connections" section above the contact picker. Nothing here touches the circle of trust (plan 2).

**Tech Stack:** Postgres 17 (Supabase: RLS, security-definer functions in `private.*` with `public.*` wrappers), Deno edge function `deliver-notifications`, Expo SDK 57 / React Native / expo-router, node:test, Playwright browser scripts.

**Spec:** `docs/superpowers/specs/2026-11-10-connections-and-circles-design.md` (CO-D1–D8, CO-P1–P6, CO-P14, screens CO-01–CO-03; mockups `docs/superpowers/specs/2026-11-10-connections-groups-chat-mockups/connections.html`). The companion `2026-11-10-groups-and-chat-design.md` CH-P21 is referenced only where it changes `request_connection`.

**Branch:** `co1-connections` from `main` at `8958fef`. Plan 2 (`2026-11-10-connections-2-circles-of-trust.md`) branches after this one is merged.

## Global Constraints

- Nothing touches the hosted Supabase project (ref `ewcsgvhuojxdpaspwsrx`) in this plan: the migration is written, tested locally and recorded in the runbook with its sha256; the owner applies it later by file name and hash. Never `supabase db push`, never `migration repair --status reverted`, never `db pull`.
- Functions: `private.x(...)` `security definer set search_path = ''` plus a thin `public.x(...)` `security invoker` wrapper; `revoke all ... from public, anon, authenticated, service_role; grant execute ... to authenticated;` for both. Private tables: RLS on, no policies, `revoke all from public, anon, authenticated`. Error codes: `42501` not allowed, `22023` invalid or unavailable, `40001` stale version.
- Every migration ships `supabase/rollback/<migration>.rollback.sql` and `supabase/tests/hosted-baseline/<migration>.before.sql` and `.after.sql`; `bash scripts/test-database-docker.sh` (full) and `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/<migration>.sql` must pass.
- Pushes go through `private.notification_outbox` → `private.notification_recipient_eligible` → `deliver-notifications`; wording: title, what happened and who; never a place, a note or a number.
- Copy lives in `mobile/src/domain/*Copy.ts` with a colocated `*.test.ts` asserting the exact strings; every new mobile test file is appended to the `test` script in `mobile/package.json`. `npm run check` in `mobile/` must pass (typecheck, tests, content).
- Read https://docs.expo.dev/versions/v57.0.0/ before any Expo code (`mobile/AGENTS.md`).
- Names before answering: never (UX2-D6). Controls 44 pt, every control labelled, states in words.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Commit after each task; never push.

## Review Focus

1. **Two people request each other at the same time.** Expected: they end up connected once, no duplicate row, each gets the "now connected" notice at most once. Test in Task 1.
2. **A refusal leaks through a second request or the state read.** Expected: the requester's second `request_connection` returns success and inserts nothing; `plan_connection_states` reports `requested_by_me` to the requester and `none` to the refuser. Test in Task 2.
3. **A push tap on a connection notice from a cold start.** Expected: lands on `/connections`, never on a blank event page or the "gone" note. Test in Task 4.
4. **Inviting a connection who is already on the resbite, or a `{user}` who is not a connection.** Expected: `already` for the first, `42501` for the second, no new row either way. Test in Task 3.
5. **An account is deleted.** Expected: its connection rows and refusals vanish, and the other side's Connections screen shows nothing of them; "Met at" is empty when the series is gone. Test in Task 3.

---

### Task 1: Migration, tables and the five connection functions

**Files:**
- Create: `supabase/migrations/20261110120000_connections.sql`
- Create: `supabase/tests/connections.sql`
- Create: `supabase/rollback/20261110120000_connections.rollback.sql`
- Create: `supabase/tests/hosted-baseline/20261110120000_connections.before.sql`, `supabase/tests/hosted-baseline/20261110120000_connections.after.sql`

**Interfaces:**
- Consumes: `private.can_see_guests(p_plan uuid)` (`20261031120000_creating_a_resbite.sql:621`), `private.is_host(p_plan, p_user)`, `private.require_tester()`, `private.host_ids`, `public.plans.series_id`, `private.notification_outbox(plan_id, recipient_id, kind, dedupe_key, actor_id, detail)`.
- Produces:
  - `public.connections (user_a uuid, user_b uuid, state text, requested_by uuid, series_id uuid null, created_at timestamptz, accepted_at timestamptz null)` with `primary key (user_a, user_b)`, `check (user_a < user_b)`, `check (state in ('requested','connected'))`; RLS select `auth.uid() in (user_a, user_b)`.
  - `private.connection_refusals (series_id uuid, from_user uuid, to_user uuid, refused_at timestamptz, primary key (series_id, from_user, to_user))`.
  - `public.request_connection(p_user uuid, p_plan uuid) returns text` → `'requested'` or `'connected'` (reverse request pending) or `'noop'` (refused earlier, quietly).
  - `public.accept_connection(p_user uuid) returns void`, `public.decline_connection(p_user uuid) returns void`, `public.cancel_connection_request(p_user uuid) returns void`, `public.remove_connection(p_user uuid) returns void`.
  - Outbox `kind` check gains `'connection_request'` and `'connection_accepted'` (the check is redefined in this migration from the list in `20261031120000_creating_a_resbite.sql:569-571`).
  - Private helper `private.pair(a uuid, b uuid) returns table (user_a uuid, user_b uuid)` ordering the two ids.

- [ ] **Step 1: Write the failing SQL test, slice 1**

In `supabase/tests/connections.sql`, prefix `f1`, users 01 owner, 02 guest Going, 03 guest Maybe, 04 guest pending (invited in the app, not answered), 05 a person on no plan, 06 Can't go. One plan `f1100000-…-0001` created by 01 with `create_plan_v4` (copy the call shape from `supabase/tests/creating-a-resbite.sql`), attendee rows for 02 (`accepted`), 03 (`maybe`), 04 (`pending`), 06 (`declined`). Assertions (each a `do $$ … raise exception … $$` under `set local role authenticated` and `set_config('request.jwt.claims', …)` for the acting user):

```sql
-- 02 asks 03: 'requested'; the row is (02,03,'requested',requested_by 02, series_id = plan's series_id); one outbox row kind connection_request, recipient 03, actor 02, dedupe 'connect:<02>:<03>:<series>'.
-- 02 asks 03 again: 'requested' and still one row, one outbox row.
-- 04 (pending) asks 02: 42501 'Names required' (can't see names yet).
-- 02 asks 04 (pending): 42501 'Not on this resbite' (a pending person can't be asked).
-- 02 asks 05: 42501 'Not on this resbite'.
-- 02 asks 06 (Can't go): 'requested' (answered people can be asked).
-- 01 (owner) asks 02: 'requested'; 02 asks 01: 'connected' (the reverse request counts as acceptance): state connected, accepted_at set, one connection_accepted outbox row to 01 only.
-- 03 accepts 02's request: state connected; outbox connection_accepted to 02, dedupe 'connected:<02>:<03>'. 02 accepting their own request: 42501.
-- 06 declines 02's request: row gone; connection_refusals has (series, 02, 06). 02 asks 06 again: 'noop', no row, no outbox. 06 asks 02: 'requested' (the refuser may still ask).
-- 02 removes 03: row gone; 03 asks 02 again later: 'requested' (removal is not a refusal).
-- 02 asks 03 then cancels: row gone; asks again: 'requested' (cancelled may be re-sent).
-- On an ended plan (update starts_at/ends_at into the past): 02 asks 03: 'requested' (connecting stays possible after the end).
-- Two sessions can't both insert: the pair primary key and the advisory lock make the second a 'connected' or 'requested' return, never a unique_violation (assert via the reverse-request case above).
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash scripts/test-database-docker.sh` from the repo root.
Expected: FAIL with `function public.create_plan_v4 … ` passing but `function public.request_connection(uuid, uuid) does not exist`.

- [ ] **Step 3: Write the migration's first section**

In `20261110120000_connections.sql`: the two tables, `private.pair`, the outbox kind check (drop and re-add `notification_outbox_kind_check` with the nine existing kinds plus the two new ones; keep the detail check as is), then the five functions. `request_connection` logic, in order: `private.require_tester()`; `pg_advisory_xact_lock(hashtextextended(least(a,b)::text || greatest(a,b)::text, 53))`; `p_user <> caller` else `22023 'That is you'`; `private.can_see_guests(p_plan)` else `42501 'Names required'`; `p_user` is the plan's owner, an admin, or has an attendee row with `response <> 'pending'` (or any attendee row when `exists(select 1 from public.chats c where c.series_id = plan.series_id and c.is_group)` — write this clause only if `public.chats` exists at the time; it does not yet, so leave a one-line comment pointing at CH-P21 and omit the clause) else `42501 'Not on this resbite'`; refusal for (series, caller, p_user) → return `'noop'`; existing row: `connected` → return `'connected'`; `requested` by caller → return `'requested'`; `requested` by p_user → accept (as `accept_connection` does) and return `'connected'`; else insert and queue `connection_request` with `plan_id = p_plan`, `actor_id = caller`, `dedupe_key = 'connect:'||least||':'||greatest||':'||series_id`, return `'requested'`. `accept_connection`: row must be `requested` with `requested_by = p_user`, else `42501 'No request'`; update; queue `connection_accepted` to `requested_by` with `plan_id` = the latest plan of `connections.series_id`, else any plan the two share, else no notice at all (the acceptance still succeeds); actor the accepter, dedupe `'connected:'||least||':'||greatest`. `decline_connection`: same precondition; delete; insert the refusal with the row's `series_id` (`on conflict do nothing`). `cancel_connection_request`: row `requested` by caller → delete; otherwise return quietly. `remove_connection`: delete a `connected` row where caller is a side; nothing to delete → quiet.

- [ ] **Step 4: Run the test to see it pass**

Run: `bash scripts/test-database-docker.sh`
Expected: PASS for `connections.sql` and every existing test.

- [ ] **Step 5: Rollback and hosted-baseline files**

Write `supabase/rollback/20261110120000_connections.rollback.sql` in the house style (header comment naming what it drops: the functions, the two tables, every `connection_request`/`connection_accepted` outbox row, then the original kind check). `before.sql`: assert `public.connections` does not exist; `after.sql`: assert it exists with RLS on and `request_connection` is granted to `authenticated` only. Run: `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261110120000_connections.sql`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261110120000_connections.sql supabase/tests/connections.sql supabase/rollback/20261110120000_connections.rollback.sql supabase/tests/hosted-baseline/20261110120000_connections.*.sql
git commit -m "Connections: the pair, its request, acceptance, refusal and removal"
```

### Task 2: The two read functions and the profile policy

**Files:**
- Modify: `supabase/migrations/20261110120000_connections.sql` (append)
- Modify: `supabase/tests/connections.sql` (slice 2)

**Interfaces:**
- Consumes: Task 1's tables; `private.can_read_profile(p_id uuid)` (`20261014120000_ux2_rules.sql:117`).
- Produces:
  - `public.my_connections() returns jsonb` → `{"requests":[{user_id,name,avatar_path,avatar_revision,series_id,title,context}], "sent":[{user_id,name,…}], "connected":[{user_id,name,avatar_path,avatar_revision,series_id,title}]}`. `title` is the title of the series' latest occurrence (`plans where series_id = … order by starts_at desc limit 1`), null when none. `context` is `'going'` when both have `accepted`/`maybe` on that latest occurrence and it has not ended, else `'met'`.
  - `public.plan_connection_states(p_plan uuid) returns jsonb` → `{"<user_id>": "none"|"requested_by_me"|"requested_by_them"|"connected", …}` for every owner, admin and attendee of the plan except the caller; `42501 'Names required'` unless `can_see_guests`. A refusal by `<user_id>` of the caller's request on this plan's series reads `requested_by_me`.
  - `private.can_read_profile` also true when a `connections` row (any state) joins `auth.uid()` and `p_id`.

- [ ] **Step 1: Write the failing test, slice 2**

```sql
-- After 02→03 requested and 02↔01 connected (set up as slice 1), as 03: my_connections().requests has one entry {user_id 02, name 'Guest A', title 'Film night', context 'going'}; as 02: sent has 03, connected has 01.
-- As 02: plan_connection_states(plan) = {01:'connected', 03:'requested_by_me', 04:'none', 06:'none'}; as 03: {…, 02:'requested_by_them'}.
-- 06 declined 02 (slice 1): as 02, states[06] = 'requested_by_me'; as 06, states[02] = 'none'.
-- As 04 (pending): plan_connection_states → 42501 'Names required'.
-- Profiles: as 05 (no shared plan) select display_name from profiles where id=02 → 0 rows; after 02↔05 are connected directly (insert the row as superuser) → 1 row; a 'requested' row also suffices; 07 (unrelated) still 0 rows.
-- The series' latest occurrence: insert a second plan with the same series_id and a later start: title comes from it.
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash scripts/test-database-docker.sh`. Expected: FAIL `function public.my_connections() does not exist`.

- [ ] **Step 3: Append the functions and the policy change**

`my_connections` and `plan_connection_states` as `language sql`/`plpgsql stable security definer` with the shapes above; `create or replace function private.can_read_profile` with the extra `or exists(select 1 from public.connections c where (c.user_a, c.user_b) = (least(auth.uid(), p_id), greatest(auth.uid(), p_id)))` clause, keeping the rest verbatim from `20261014120000_ux2_rules.sql:117-121`.

- [ ] **Step 4: Run the test to see it pass**

Run: `bash scripts/test-database-docker.sh`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261110120000_connections.sql supabase/tests/connections.sql
git commit -m "Connections: what each person may read of the pair"
```

### Task 3: Inviting a connection, eligibility, deletion

**Files:**
- Modify: `supabase/migrations/20261110120000_connections.sql` (append)
- Modify: `supabase/tests/connections.sql` (slice 3)
- Modify: `supabase/rollback/20261110120000_connections.rollback.sql`, the hosted-baseline `after.sql`

**Interfaces:**
- Consumes: `private.invite_contacts(p_plan uuid, p_invites jsonb)` (`20261031120000_creating_a_resbite.sql:686`), `private.notification_recipient_eligible(p_outbox bigint)` (`:963`), the account-deletion function in `supabase/migrations/20261022120001_gi2_local_delivery_and_deletion.sql` (the one that writes `'Deleted member'`, around line 83).
- Produces:
  - `invite_contacts` accepts items `{"user": "<uuid>"}` beside `{"phone","country","code"}`; for a `user` item: the pair must be `connected` with the caller else `42501 'Not a connection'`; the user already on the plan (owner, attendee row) → kind `already`; else insert the pending attendee, queue `invited` (dedupe `'invited:'||plan||':'||user`, actor caller) and return kind `app`. The returned object for a user item is `{"user": "<uuid>", "kind": …}`. A batch may mix both shapes; the 50-item cap and `charge_lookup` apply to phone items only.
  - `notification_recipient_eligible`: for kinds `connection_request` and `connection_accepted` the predicate is `user_eligible(recipient) and not deletion_pending(recipient) and created_at > now() - 24 hours and exists(select 1 from public.connections c where least/greatest(recipient, actor) = (c.user_a, c.user_b) and (kind = 'connection_accepted' and c.state = 'connected' or kind = 'connection_request' and c.state = 'requested' and c.requested_by = actor))` — no plan membership test, no mutes.
  - Deletion: the lifecycle also runs `delete from public.connections where auth.uid() in (user_a, user_b)` and `delete from private.connection_refusals where from_user = p_user or to_user = p_user` (names per the function's variables).

- [ ] **Step 1: Write the failing test, slice 3**

```sql
-- 01 (owner) invites {user: 03} while 01↔03 connected and 03 not on plan 2: kind 'app', attendees row (plan2, 03, pending), outbox invited to 03 with actor 01.
-- 01 invites {user: 02} already on plan 2: kind 'already', no new row. 01 invites {user: 05} (not connected): 42501 'Not a connection'.
-- A mixed batch [{user:03},{phone:…}] returns two results in order.
-- Eligibility: the connection_request row from slice 1 (02→03) is eligible for 03 while the row is 'requested'; after 03 declines, not eligible. The connection_accepted row to 02 is eligible while connected; after remove_connection, not.
-- Deletion: run the deletion function for 03 (copy the call from supabase/tests/deletion.sql); connections and refusals involving 03 are gone; my_connections() as 02 lists no 03.
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash scripts/test-database-docker.sh`. Expected: FAIL at the `{user}` item (`22023 'Invalid invitation'`).

- [ ] **Step 3: Append the three function redefinitions**

`create or replace` the three functions with the changes above, copying their current bodies from the migrations named and changing only what Interfaces says. Update the rollback (restore the three bodies from the earlier migrations) and `after.sql` (a `{user}` item is accepted syntactically: call with an unconnected user and expect `42501 'Not a connection'`).

- [ ] **Step 4: Run both harness modes to see them pass**

Run: `bash scripts/test-database-docker.sh && bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261110120000_connections.sql`. Expected: PASS, PASS.

- [ ] **Step 5: Record the hash and commit**

Run: `sha256sum supabase/migrations/20261110120000_connections.sql` and keep the value for Task 9.

```bash
git add supabase/migrations/20261110120000_connections.sql supabase/tests/connections.sql supabase/rollback/20261110120000_connections.rollback.sql supabase/tests/hosted-baseline/20261110120000_connections.after.sql
git commit -m "Connections: inviting a connection in the app, the notices' eligibility, deletion"
```

### Task 4: Sender copy and the app's tap routing

**Files:**
- Modify: `supabase/functions/_shared/notification-copy.ts:55-102`, `supabase/functions/_shared/notification-copy.test.ts`
- Modify: `supabase/functions/_shared/notification-engine.ts:54-72` (`payloadFor`)
- Modify: `mobile/src/services/pushRegistration.ts:162-185` (`parseNotificationTarget`), `mobile/src/services/pushTaps.ts:12-16`, `mobile/src/domain/pushRoute.ts`, their tests `pushRegistration.test.ts`, `pushTaps.test.ts`, `pushRoute.test.ts`

**Interfaces:**
- Consumes: `CopyInput {kind, detail, title, starts_at, time_zone, actor_name}`; `Delivery`; `createPushTapRouter(deps)`.
- Produces:
  - `notificationCopy` for `connection_request`: `{ title: "<actor> wants to connect", body: starts_at in the future ? "You're both going to <title>." : "You were both at <title>." }`; for `connection_accepted`: `{ title: "You and <actor> are now connected", body: "You can invite each other from Invite people." }`; without an actor name, `GENERIC_COPY`.
  - `payloadFor(job).data.type` is `"connection"` when `job.kind` is one of the two, else `"plan_update"` as today.
  - `parseNotificationTarget` returns `{ kind: "plan"|"connection", planId, notificationId }` (field `kind` added; `type: "connection"` accepted with the same id checks).
  - `pushDestination(result, kind)`: `kind === "connection"` → `{ pathname: "/connections" }` regardless of `result`; otherwise as today. `PushDestination` gains `| { pathname: "/connections" }`.
  - `createPushTapRouter`: for a connection tap, skips `readAuthorizedPlan` and opens `/connections` once the context is ready and approved.

- [ ] **Step 1: Write the failing tests**

In `notification-copy.test.ts` (node:test, as the file does):
```ts
test("a connection request leads with who, and says where you met", () => {
  assert.deepEqual(notificationCopy({ kind: "connection_request", title: "Board game night", actor_name: "Pedro", starts_at: "2099-01-01T19:00:00Z", time_zone: "UTC" }),
    { title: "Pedro wants to connect", body: "You're both going to Board game night." });
  assert.deepEqual(notificationCopy({ kind: "connection_request", title: "Picnic", actor_name: "Pedro", starts_at: "2020-01-01T19:00:00Z", time_zone: "UTC" }),
    { title: "Pedro wants to connect", body: "You were both at Picnic." });
  assert.deepEqual(notificationCopy({ kind: "connection_accepted", title: "Picnic", actor_name: "Ana" }),
    { title: "You and Ana are now connected", body: "You can invite each other from Invite people." });
  assert.deepEqual(notificationCopy({ kind: "connection_request", title: "Picnic", actor_name: "" }), GENERIC_COPY);
});
```
In `pushRegistration.test.ts`: `parseNotificationTarget({ type: "connection", planId: UUID, notificationId: "7" })` → `{ kind: "connection", planId, notificationId: "7" }`; an unknown type still `null`; a plan target carries `kind: "plan"`. In `pushRoute.test.ts`: `pushDestination(null, "connection")` → `{ pathname: "/connections" }`; `pushDestination("p", "plan")` unchanged. In `pushTaps.test.ts`: a connection tap with a ready, approved context opens `/connections` and never calls `readAuthorizedPlan` (count calls). An engine test (add to the existing engine test file if there is one, else `notification-engine.test.ts`): `payloadFor({...job, kind: "connection_request"}).data.type === "connection"`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd supabase/functions && node --experimental-transform-types --test _shared/*.test.ts`; `cd mobile && node --import tsx src/services/pushRegistration.test.ts && node --import tsx src/domain/pushRoute.test.ts && node --import tsx src/services/pushTaps.test.ts`. Expected: FAIL on the new assertions only.

- [ ] **Step 3: Implement**

Add the two `case`s in `notificationCopy` before the `body()` fall-through (they lead with who, like `admin_added`). In `payloadFor`, choose the type from `job.kind`. Extend `parseNotificationTarget`, `isResbitePush` (`pushTaps.ts:16`: accept both types), `pushDestination` and the router's flush (branch on the parsed kind before the plan read).

- [ ] **Step 4: Run the tests and the typecheck**

Run the two commands of Step 2 and `cd mobile && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared mobile/src/services/pushRegistration.ts mobile/src/services/pushRegistration.test.ts mobile/src/services/pushTaps.ts mobile/src/services/pushTaps.test.ts mobile/src/domain/pushRoute.ts mobile/src/domain/pushRoute.test.ts
git commit -m "Connections: the two pushes and where a tap on them lands"
```

### Task 5: The mobile gateway and copy

**Files:**
- Create: `mobile/src/services/connections.ts`, `mobile/src/services/connections.test.ts`
- Create: `mobile/src/domain/connectionsCopy.ts`, `mobile/src/domain/connectionsCopy.test.ts`
- Modify: `mobile/package.json` (`test` script: append the two test files)

**Interfaces:**
- Consumes: `Rpc`, `Deadline`, `passThrough`, `planDeadline`, `errorField` from `mobile/src/services/contactInvites.ts` (as `admins.ts` does).
- Produces:
  - `type ConnectionState = "none" | "requested_by_me" | "requested_by_them" | "connected"`.
  - `type ConnectionPerson = { userId: string; name: string; avatarPath: string | null; avatarRevision: number; seriesId: string | null; title: string | null; context?: "going" | "met" }`.
  - `type MyConnections = { requests: ConnectionPerson[]; sent: ConnectionPerson[]; connected: ConnectionPerson[] }`.
  - `createConnectionGateway(rpc, deadline?)` → `{ request(userId, planId): Promise<"requested"|"connected"|"noop">; accept(userId); decline(userId); cancel(userId); remove(userId); mine(): Promise<MyConnections>; statesFor(planId): Promise<Record<string, ConnectionState>> }`, each calling the RPC of the same name (`request_connection` with `{ p_user, p_plan }`, the others `{ p_user }`, `my_connections` `{}`, `plan_connection_states` `{ p_plan }`), throwing the server's error as `adminGateway` does; `connectionGateway` the default instance.
  - `connectionErrorMessage(e): string`: `42501` + `'Names required'` → `CONNECTIONS_COPY.namesFirst`; `42501` + `'Not on this resbite'` → `CONNECTIONS_COPY.notHere`; `22023` → `CONNECTIONS_COPY.failed`; else `INVITE_COPY.offline`.
  - `CONNECTIONS_COPY`: `heading: "Connections"`, `requests: "Requests"`, `connected: "Connected"`, `accept: "Accept"`, `notNow: "Not now"`, `remove: "Remove connection"`, `removeQuestion: (name) => \`Remove ${name} from your connections? Neither of you will be told.\``, `keep: "Keep"`, `empty: "Nobody yet. You can connect with people who share a resbite with you, from its people list."`, `noSearch: "You can only connect with people who share a resbite with you. There is no search."`, `metAt: (title) => \`Met at ${title}\``, `metOnResbite: "Met on Resbite"`, `bothGoing: (title) => \`You're both going to ${title}\``, `bothAt: (title) => \`You were both at ${title}\``, `connect: "Connect on Resbite"`, `connectHint: (name) => \`${name} decides. Then you can invite each other in the app.\``, `requestSent: "Request sent"`, `cancelRequest: "Cancel request"`, `connectedBadge: "Connected"`, `acceptFrom: (name) => \`Accept ${name}'s request\``, `yourConnections: "Your connections"`, `invitedAlready: "Invited"`, `profileRow: "Connections"`, `peopleListsRow: "People lists"`, `namesFirst: "Answer first to connect with people here."`, `notHere: "That person isn't on this resbite."`, `failed: "Couldn't do that. Try again."`.

- [ ] **Step 1: Write the failing tests**

`connections.test.ts` mirrors `admins.test.ts`: each gateway method sends the right function and arguments; a refusal is thrown as sent; `mine()` maps the server's snake_case to `ConnectionPerson` (`avatar_path` → `avatarPath`, missing arrays → `[]`); `connectionErrorMessage` for the three cases. `connectionsCopy.test.ts` asserts every string above exactly (the house style: one `assert.equal` per key, functions called with a sample).

- [ ] **Step 2: Run them to see them fail**

Run: `cd mobile && node --import tsx src/services/connections.test.ts; node --import tsx src/domain/connectionsCopy.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement the two files and append both tests to `package.json`'s `test` chain**

- [ ] **Step 4: Run `cd mobile && npm test`**

Expected: PASS, the two new files included.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/services/connections.ts mobile/src/services/connections.test.ts mobile/src/domain/connectionsCopy.ts mobile/src/domain/connectionsCopy.test.ts mobile/package.json
git commit -m "Connections: the gateway and the words"
```

### Task 6: The Connections screen and the Profile rows

**Files:**
- Create: `mobile/app/connections.tsx`, `mobile/src/state/useConnections.ts`, `mobile/src/state/useConnections.test.ts`
- Modify: `mobile/app/(tabs)/profile.tsx:161-166` (rows), `mobile/scripts/verify-people.mjs` (the renamed row), `mobile/scripts/verify-notifications.mjs` if it names Profile rows
- Create: `mobile/scripts/verify-connections.mjs` (first half; Task 8 extends it)

**Interfaces:**
- Consumes: `connectionGateway`, `CONNECTIONS_COPY`, `useFocusedRefresh` (`mobile/src/state/useFocusedRefresh.ts`), kit pieces `RowGroup`/`Row` (profile), `GrabberSheet`, `MenuRow`, `Avatar` (as `guests.tsx` uses them).
- Produces:
  - Route `/connections` (screen CO-02): title bar with Back; groups "Requests · N" (a card per request: avatar, name, context line `bothGoing(title)`/`bothAt(title)`/`metOnResbite`, two pills Accept and Not now, stacked under Larger Text) and "Connected · N" (rows: avatar, name, `metAt(title)` or `metOnResbite`, three dots → sheet with "Remove connection" and an in-place confirm `removeQuestion(name)` / Remove / Keep); empty state `empty`; footer line `noSearch` when not empty.
  - `useConnections()` → `{ data: MyConnections | null; busy; error; load(); accept(userId); decline(userId); remove(userId) }` with the focused-refresh pattern and optimistic removal of the card/row on success.
  - Profile: a new `Row` "Connections" (icon `Link2` from lucide, `categoryPalette.uplifting` tint) above the first row, with a count badge of pending requests when > 0 (read once on focus via `connectionGateway.mine()`; a failed read shows no badge); the "People & groups" row retitled `peopleListsRow` ("People lists"); the row's accessibility label follows.

- [ ] **Step 1: Write the failing tests**

`useConnections.test.ts` (node:test with a fake gateway, like other `useX.test.ts` files that exercise reducers; if the house pattern tests hooks through a pure helper, write the helper `applyDecision(data, userId, decision)` in `useConnections.ts` and test it): accepting moves the person from `requests` to `connected`; declining removes them; removing removes from `connected`. Extend `verify-people.mjs` to click "People lists" instead of "People & groups" (it will fail until the rename). Start `verify-connections.mjs`: preview-free fixture like `verify-contact-invites.mjs` (stub `my_connections` with one request and two connected; stub `accept_connection`, `decline_connection`, `remove_connection`), open Profile → Connections, expect the three names, tap Accept on the request and expect the `accept_connection` RPC with `{ p_user }` and the name to move under "Connected · 3", open the dots on a connected person, Remove connection, confirm, expect `remove_connection` and the row gone.

- [ ] **Step 2: Run to see them fail**

Run: `cd mobile && node --import tsx src/state/useConnections.test.ts` (module missing) and, with Expo web running on 8081, `node scripts/verify-connections.mjs` (no "Connections" row). Expected: FAIL.

- [ ] **Step 3: Implement the screen, the hook and the Profile rows**

Follow `guests.tsx` for the list, head and sheet; `IconButton` for the dots with label `Actions for <name>`; pills from the kit's `Button` (`secondary` for Not now). Register nothing in `_layout.tsx` unless the router needs a screen entry (check how `/guests` is declared).

- [ ] **Step 4: Run the unit test, `npm run check`, and the two browser scripts**

Expected: PASS; `verify-people.mjs` passes with "People lists"; `verify-connections.mjs` passes its first half.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/connections.tsx mobile/src/state/useConnections.ts mobile/src/state/useConnections.test.ts mobile/app/\(tabs\)/profile.tsx mobile/scripts/verify-people.mjs mobile/scripts/verify-connections.mjs mobile/package.json
git commit -m "Connections: the screen in Profile, requests and the connected list"
```

### Task 7: Connect from the people list

**Files:**
- Modify: `mobile/src/domain/eventPage.ts:281-381` (`PersonAction`, `PersonRow`, `peopleGroups`), `mobile/src/domain/eventPage.test.ts`
- Modify: `mobile/src/state/useEvent.ts` (read `plan_connection_states` beside the guests; expose `connections: Record<string, ConnectionState>` and `connect/acceptConnection/declineConnection/cancelRequest(userId)`), `mobile/app/guests.tsx:115-260`
- Browser coverage of this task comes with `verify-connections.mjs`'s second half in Task 8.

**Interfaces:**
- Consumes: Task 5's `ConnectionState`, `connectionGateway.statesFor/request/accept/decline/cancel`, `CONNECTIONS_COPY`.
- Produces:
  - `PersonAction` gains `"connect" | "cancelRequest" | "acceptConnection" | "declineConnection"`; `PersonRow` gains `connection: ConnectionState | null` (null for rows without an account and for yourself) and `me: boolean`.
  - `peopleGroups(i)` takes `connections: Record<string, ConnectionState>` and `userId: string`; for every row with a `userId` other than the viewer: `connect` when state `none`; `cancelRequest` when `requested_by_me`; `acceptConnection` + `declineConnection` when `requested_by_them`; nothing when `connected`. These precede the host actions in `actions`. Connection actions are offered to hosts and to guests alike, only when names are shown (the guest list already is), and on ended resbites too (CO rule 7); host actions keep their `acts` gate.
  - `guests.tsx`: the dots button shows when `row.actions.length > 0` (not only for hosts) and never on your own row; the sheet renders `connect` as a `MenuRow` with `CONNECTIONS_COPY.connect` and a sub-line `connectHint(name)`; `requested_by_me` as a disabled row `requestSent` plus `cancelRequest`; `requested_by_them` as `acceptFrom(name)` and `notNow`; `connected` as a label row `connectedBadge` with no action; the name line shows a `connectedBadge` chip when connected. After any connection action, `useEvent` reloads the states only (not the whole event).

- [ ] **Step 1: Write the failing tests**

In `eventPage.test.ts`:
```ts
test("the people list offers Connect to a guest on everyone with an account but themselves", () => {
  const groups = peopleGroups({ role: "guest", state: "open", guests, invited: [], requests: [], admins: [], userId: "u-me",
    connections: { "u-ana": "none", "u-leo": "connected", "u-sol": "requested_by_them", "u-nico": "requested_by_me" } });
  const row = (id) => groups.flatMap((g) => g.rows).find((r) => r.userId === id);
  assert.deepEqual(row("u-ana").actions, ["connect"]);
  assert.deepEqual(row("u-leo").actions, []); assert.equal(row("u-leo").connection, "connected");
  assert.deepEqual(row("u-sol").actions, ["acceptConnection", "declineConnection"]);
  assert.deepEqual(row("u-nico").actions, ["cancelRequest"]);
  assert.deepEqual(row("u-me").actions, []); assert.equal(row("u-me").me, true);
});
test("hosts get the connection action before their own, and link invitees get none", …) // owner on a Going guest: ["connect","makeAdmin","remove"]; a linkInvite row: connection null, actions as before.
test("connecting is offered after the end, host actions are not", …) // state "ended", owner: ["connect"] only.
```

- [ ] **Step 2: Run to see it fail**

Run: `cd mobile && node --import tsx src/domain/eventPage.test.ts`. Expected: FAIL (unknown `connections` input, actions differ).

- [ ] **Step 3: Implement `peopleGroups`, then `useEvent` and `guests.tsx`**

`useEvent.read`: after `readEvent`, when `showsNames(role, response)` call `connectionGateway.statesFor(planId).catch(() => ({}))`; store in state; expose the four actions, each calling the gateway then re-reading the states. `guests.tsx`: `ACTION_ICON` gains `connect: Link2`, `cancelRequest: X`, `acceptConnection: Check`, `declineConnection: X`; `perform` routes the four to `event.*`; errors through `connectionErrorMessage`.

- [ ] **Step 4: Run `npm run check`**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/domain/eventPage.ts mobile/src/domain/eventPage.test.ts mobile/src/state/useEvent.ts mobile/app/guests.tsx
git commit -m "Connections: Connect, Accept and Not now from the people list"
```

### Task 8: "Your connections" on Invite people

**Files:**
- Create: `mobile/src/design/ConnectionsPicker.tsx`
- Modify: `mobile/src/state/useContactInvites.ts:30-37,243-286` (a `connections` selection beside the numbers; `invite()` sends `{user}` items too), `mobile/src/state/useContactInvites.test.ts` (if present; else add the assertions to `mobile/src/services/contactInvites.test.ts`), `mobile/src/services/contactInvites.ts:81-101` (`invite(plan, items)` accepts `{user}` items and returns `{user, kind}` for them), `mobile/app/invitations.tsx:91-115`, `mobile/src/domain/inviteCopy.ts` (the Event link hint), `mobile/scripts/verify-connections.mjs` (second half)

**Interfaces:**
- Consumes: `connectionGateway.mine()`, `CONNECTIONS_COPY.yourConnections/invitedAlready`, `contactInviteGateway.invite`.
- Produces:
  - `contactInviteGateway.invite(plan, items: ({phone,country,code} | {user})[])` → `({phone, kind} | {user, kind})[]`, `kind` `"app" | "already" | "link" | "self"`.
  - `useContactInvites` gains `connections: ConnectionPerson[]` (loaded once when `enabled`, failure → `[]`), `chosenUsers: Set<string>`, `toggleUser(userId)`, `invitedUsers: Set<string>` (connections already on the plan: from the event's guests, passed in as `onPlan: string[]`), and `invite()` sends `[...phoneItems, ...[...chosenUsers].map((user) => ({ user }))]`; the outcome counts `app` users under `inApp` by name.
  - `ConnectionsPicker({ k })`: heading "Your connections · N", rows (avatar, first name, a 24 pt checkbox with label "Select <name>" / "Invited" text when in `invitedUsers`), a search field when N > 8; nothing rendered when N = 0.
  - `invitations.tsx`: `ConnectionsPicker` above `PickStep`; the Invite button's count = contacts + users (where the count lives today in `PickStep`, lift it or pass the user count in); `INVITE_COPY.eventLinkHint = "Anyone who answers through the link waits for your approval."` shown under the Event link heading.

- [ ] **Step 1: Write the failing tests**

In `contactInvites.test.ts`: `invite` sends a mixed batch and maps a `{user, kind}` reply; a reply missing `user` fails as `offline`. In the hook's test (or a pure helper `inviteItems(selected, chosenUsers)` exported from `useContactInvites.ts`): phone items precede user items; a chosen user already in `invitedUsers` is not sent. Browser (`verify-connections.mjs`, second half): as the host of the fixture plan, open Invite people; stub `my_connections` with Marta, Lucas (already on the plan, so "Invited"), Sofía; tick Marta; expect the button "Invite 1"; tap; expect `invite_contacts` called with `{ p_plan, p_invites: [{ user: <marta> }] }` and the Almost there text naming Marta.

- [ ] **Step 2: Run to see them fail**

Run: `cd mobile && node --import tsx src/services/contactInvites.test.ts` and `node scripts/verify-connections.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement**

Keep `PickStep` as is; add the picker component and the hook fields; pass `onPlan` from `invitations.tsx` (it has `plan`; read guests' ids with `readGuests(plan.id)` as `useEvent` does, failure → `[]`).

- [ ] **Step 4: Run `npm run check` and `node scripts/verify-connections.mjs`**

Expected: PASS, PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/design/ConnectionsPicker.tsx mobile/src/state/useContactInvites.ts mobile/src/services/contactInvites.ts mobile/src/services/contactInvites.test.ts mobile/app/invitations.tsx mobile/src/domain/inviteCopy.ts mobile/src/domain/inviteCopy.test.ts mobile/scripts/verify-connections.mjs
git commit -m "Connections: inviting a connection from Invite people"
```

### Task 9: Runbook, decisions, status

**Files:**
- Create: `qa/connections-2026-11-10/README.md`
- Modify: `knowledge-base/08-decisions.md` (dated additions at the end: CO-D1–D8, CO-P1–P6, CO-P14, one line each as the CR entries are written), `docs/implementation-status.md` (a dated "Connections" entry: built, not rolled out)

**Interfaces:** none.

- [ ] **Step 1: Write the runbook** in the house sections (What is built · Files and hashes · Checks made locally · Rollout runbook · Applied · Rollback · Not done here), copying the step list of `qa/creating-a-resbite-2026-10-31/README.md`: before snapshot (owner-run scripts), the migration by name and sha256 (from Task 3 Step 5), after snapshot and advisors, `deliver-notifications` redeploy (the copy changed), the TestFlight build note, device checks (request, accept, invite a connection, push taps). "Not done here": the circle of trust (plan 2).

- [ ] **Step 2: Append the decisions and the status entry.**

- [ ] **Step 3: Run the whole check once more**

Run: `bash scripts/test-database-docker.sh && (cd mobile && npm run check) && (cd supabase/functions && node --experimental-transform-types --test _shared/*.test.ts)`. Expected: PASS ×3.

- [ ] **Step 4: Commit**

```bash
git add qa/connections-2026-11-10/README.md knowledge-base/08-decisions.md docs/implementation-status.md
git commit -m "Connections: the runbook and the record"
```
