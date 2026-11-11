# Connections Follow-ups and the Roll Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the repeating-resbite roll that drops a guest who changed from Going to Can't go, make the connection request's push say only what is true, and clear the connection polish the final review deferred.

**Architecture:** One small migration redefines `private.roll_repeating_plans` (carry every guest row) and `private.request_connection` (the notice carries a `detail`), and widens the outbox detail check. The sender's copy reads the new detail. A batch of mobile polish touches the Connections screen, Profile and Invite people. No new screens.

**Tech Stack:** Postgres 17 (Supabase), Deno edge function `deliver-notifications`, Expo SDK 57 / React Native, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-groups-and-chat-design.md` CH-P20 (the roll fix, moved forward from the groups plan by the roadmap) and `docs/superpowers/specs/2026-11-10-connections-and-circles-design.md` CO-P5 (the request push). The final review of plan 1 (decisions log, CO-R1–R9; `qa/connections-2026-11-10/README.md` "Not done here") lists the deferred items this plan takes.

**Branch:** `co3-follow-ups` from `main` at `3e5d37f`. Roadmap: `docs/superpowers/plans/2026-11-11-roadmap-connections-groups-chat.md`.

## Global Constraints

- Nothing touches the hosted project in this plan; the migration is applied later by the owner, by file name and sha256. Never `supabase db push`, never `migration repair --status reverted`, never `db pull`.
- Functions keep the house shape: `private.x` security definer `set search_path = ''`, thin `public.x` wrapper, explicit revoke/grant; error codes 42501 / 22023.
- Every migration ships `supabase/rollback/<name>.rollback.sql` and hosted-baseline `before.sql`/`after.sql`; `bash scripts/test-database-docker.sh` and `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/<name>.sql` both pass.
- A redefined function is copied from its latest definition and changed only as the task says: `roll_repeating_plans` from `supabase/migrations/20261031120000_creating_a_resbite.sql:1006`, `request_connection` from `supabase/migrations/20261110120000_connections.sql:84`.
- Copy in `mobile/src/domain/*Copy.ts` with exact-string tests; new mobile tests appended to the `test` chain in `mobile/package.json`; `npm run check` green; edge tests run with `node --import ./mobile/node_modules/tsx/dist/loader.mjs <file>` from the repo root (this machine's Node lacks `--experimental-transform-types`).
- After pulling or merging new screens, start Expo once in the checkout (`npx expo start --web --port 8081`, stop it by its process group) before `npm run typecheck`: the typed-route file is generated and git-ignored.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit per task; never push.

## Review Focus

1. **A guest who said Can't go this week.** Expected: carried to the next occurrence as not answered, invited again with the "is on again" push; an admin who said Can't go is carried as a guest, not as an admin (CR-P15). Test in Task 1.
2. **A request on a resbite where the asker is Going and the other said Can't go.** Expected: the push says "You're both invited to …", never "both going". Test in Task 1 (detail) and Task 2 (copy).
3. **A notice queued before this migration (no detail) reaching the new sender.** Expected: the old wording (future start → "both going", else "both at"). Test in Task 2.
4. **Two people asking each other at the same instant.** Expected: one connected pair, at most one acceptance notice, no error to either. Test in Task 1 (concurrency script).
5. **A failed refresh on the Connections screen.** Expected: the list stays on screen with the error line above it; only a first read that fails shows Try again. Test in Task 3.

---

### Task 1: Migration: the roll carries every guest; the request notice says how the two stand

**Files:**
- Create: `supabase/migrations/20261111120000_connections_follow_ups.sql`
- Create: `supabase/tests/connections-follow-ups.sql`, `supabase/tests/local/connections-concurrency.sh`
- Modify: `scripts/test-database.sh:33-38` (run the new concurrency script with the others)
- Create: `supabase/rollback/20261111120000_connections_follow_ups.rollback.sql`, `supabase/tests/hosted-baseline/20261111120000_connections_follow_ups.before.sql`, `.after.sql`
- Modify: `supabase/tests/hosted-baseline/tests.txt` (append `connections-follow-ups.sql`)

**Interfaces:**
- Consumes: `private.roll_repeating_plans()` (creating_a_resbite:1006), `private.request_connection(p_user uuid, p_plan uuid) returns text` (connections:84), `notification_outbox_detail_check` (creating_a_resbite:573).
- Produces:
  - `roll_repeating_plans`: the carried-attendee insert (creating_a_resbite:1039-1040) drops `response<>'withdrawn'`; everything else verbatim.
  - `request_connection`: the `connection_request` outbox row gets `detail` = `'going'` when the plan is `status='active'`, not ended (`private.plan_end(...) > now()`), and both people are a host or have `response in ('accepted','maybe')`; `'met'` when the plan has ended; `'invited'` otherwise. Everything else verbatim (static key, refusal paths, stamping).
  - `notification_outbox_detail_check` gains `or (kind='connection_request' and detail in ('going','invited','met'))`.

- [ ] **Step 1: Write the failing SQL test** (`supabase/tests/connections-follow-ups.sql`, prefix `h1`; copy the setup idiom of `supabase/tests/connections.sql`)

```sql
-- Roll: a weekly plan with guests 02 (Going → Can't go, stored 'withdrawn'), 03 (declined), 04 (accepted), 05 admin who
-- answered Can't go after being appointed; end it; call private.roll_repeating_plans() as superuser.
-- The new occurrence has pending rows for 02, 03, 04 and 05; 05 is NOT in plan_admins of the new occurrence;
-- an 'invited' notice with detail 'again' exists for 02.
-- Detail: 02 Going, 03 Maybe on an open plan: 02 asks 03 → detail 'going'. 04 Going, 06 Can't go: 04 asks 06 → 'invited'.
-- Ended plan: 02 asks 07 (both answered) → 'met'. Owner 01 (host, no attendee row) asks 04 (Going) on an open plan → 'going'.
-- The detail check refuses ('connection_request','soon') with check_violation.
```

- [ ] **Step 2: Run it to see it fail.** `bash scripts/test-database-docker.sh` → FAIL at the roll assertion for 02 (no row) or at the first detail assertion.

- [ ] **Step 3: Write the migration** (the two redefinitions and the check), then **the concurrency script** `supabase/tests/local/connections-concurrency.sh "$pg_bin" "$work" "$port"` in the shape of `decide-join-concurrency.sh`: two sessions, A asks B and B asks A at the same time (`select pg_sleep(0.2)` inside one transaction before commit); expect exactly one `public.connections` row in state `connected`, no unique_violation in either session's log, and at most one `connection_accepted` outbox row. Add it to `scripts/test-database.sh` after `decide-join-concurrency.sh`.

- [ ] **Step 4: Run both harness modes.** `bash scripts/test-database-docker.sh` and `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261111120000_connections_follow_ups.sql` → PASS. Rollback restores both functions' previous bodies and the previous detail check (and deletes nothing: outbox rows with the new details must be deleted first; the rollback says so in its header and deletes `connection_request` rows whose detail is not null). Record `sha256sum` of the migration and the rollback.

- [ ] **Step 5: Commit** — `git commit -m "Follow-ups: the roll carries every guest; a request's push says how the two stand"`

### Task 2: The request push's words

**Files:**
- Modify: `supabase/functions/_shared/notification-copy.ts` (the `connection_request` case), `supabase/functions/_shared/notification-copy.test.ts`

**Interfaces:**
- Consumes: `CopyInput.detail`.
- Produces: `connection_request` body by detail: `going` → `"You're both going to <title>."`, `invited` → `"You're both invited to <title>."`, `met` → `"You were both at <title>."`; detail missing → today's rule (future `starts_at` → "both going", else "both at"). Title unchanged: `"<actor> wants to connect"`.

- [ ] **Step 1: Failing test** with one assertion per detail and one with no detail and a future start (old wording kept).
- [ ] **Step 2: Run** `node --import ./mobile/node_modules/tsx/dist/loader.mjs supabase/functions/_shared/notification-copy.test.ts` → FAIL on `invited`.
- [ ] **Step 3: Implement.** **Step 4: Run** → PASS, and the other 10 `_shared/*.test.ts` files still pass.
- [ ] **Step 5: Commit** — `"Follow-ups: the request push names how the two stand"`

### Task 3: Connection polish in the app

**Files:**
- Modify: `mobile/app/connections.tsx` (spoken labels at ~:59 and ~:97 to copy; keep the list on a failed refresh), `mobile/app/(tabs)/profile.tsx` (~:172 spoken label to copy; badge text capped at "99+"), `mobile/src/state/useConnections.ts` (a failed read keeps `data` when it already holds a list), `mobile/src/services/contactInvites.ts` (`inviteConnections`: a refused call holding one connection is not sent again), `mobile/src/design/ConnectionsPicker.tsx:20` (write the accent range as `/[̀-ͯ]/g`), `mobile/src/design/kit.tsx` (the `Row` badge accepts the capped text), `mobile/src/domain/connectionsCopy.ts` and its test, `mobile/scripts/verify-connections.mjs` (replace the fixed 300 ms wait with a poll on the absence)
- Test: `mobile/src/domain/connectionsCopy.test.ts`, `mobile/src/state/useConnections.test.ts`, `mobile/src/services/contactInvites.test.ts`

**Interfaces:**
- Produces:
  - `CONNECTIONS_COPY.notNowFrom: (name) => \`Not now, ${name}'s request\``, `CONNECTIONS_COPY.waitingLabel: (n) => n === 1 ? "Connections, 1 request" : \`Connections, ${n} requests\``, `CONNECTIONS_COPY.badge: (n) => (n > 99 ? "99+" : String(n))`.
  - `keepOnFailure(previous: MyConnections | null, failed: boolean): MyConnections | null` in `mobile/src/state/connectionsModel.ts`, used by `useConnections` on the Connections screen; Profile's badge read keeps today's rule (a failure shows no badge).

- [ ] **Step 1: Failing tests:** the three copy strings; `keepOnFailure(list, true)` returns `list`, `keepOnFailure(null, true)` returns `null`; `inviteConnections` with one user and a 42501 'Not a connection' makes exactly one call and reports that user refused.
- [ ] **Step 2: Run** `cd mobile && node --import tsx src/domain/connectionsCopy.test.ts` (and the two others) → FAIL.
- [ ] **Step 3: Implement**; the Connections screen shows `connectionErrorMessage(e)` above a kept list.
- [ ] **Step 4: Run** `cd mobile && npm run check` → PASS; start Expo web on 8081 and run `node scripts/verify-connections.mjs` → PASS; stop Expo by its process group.
- [ ] **Step 5: Commit** — `"Follow-ups: the connection screens keep what they had and say it all in the copy"`

### Task 4: Runbook and record

**Files:**
- Create: `qa/connections-follow-ups-2026-11-11/README.md`
- Modify: `knowledge-base/08-decisions.md` (CO-R10: the request push names how the two stand; CH-P20 shipped ahead of the groups plan), `docs/implementation-status.md`

- [ ] **Step 1: Runbook** in the house sections, with the migration and rollback sha256s, the before/after snapshots and advisors (expected: no new finding), the sender redeploy (Task 2 changed the copy), and the note that **the roll job (`supabase/ops/schedule-roll-repeating-plans.sql`, owner-run) may be created once this migration is live and the creating-a-resbite TestFlight build is out** (creating-a-resbite runbook step 7). The app polish needs a TestFlight build but no ordering with the server.
- [ ] **Step 2: Full check:** `bash scripts/test-database-docker.sh`, `(cd mobile && npm run check)`, every `supabase/functions/_shared/*.test.ts` with the loader → PASS ×3.
- [ ] **Step 3: Commit** — `"Follow-ups: the runbook and the record"`
