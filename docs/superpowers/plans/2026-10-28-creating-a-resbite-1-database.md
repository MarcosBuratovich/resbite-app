# Creating a resbite (Plan 1 of 3): the database and the web page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One hosted-compatible migration that moves a resbite's cut-off from its start to its end, adds admins, per-person mutes, "To be decided", a required end time and repeating resbites (rolling one occurrence ahead), with the web invitation pages following; everything the two app plans build on.

**Architecture:**
- **One helper for the boundary.** `private.plan_end(starts_at, ends_at)` is `coalesce(ends_at, starts_at)`. Every function that checks `starts_at <= now()` today checks `plan_end(...) <= now()` instead; the web state functions say `happened` from the end.
- **Hosts.** `public.plan_admins` lists a plan's admins. `private.is_host(plan, user)` is "owner or admin"; `private.require_link_owner` (kept by name, called from eight functions) now admits hosts; host notices go to `private.host_ids(plan)` minus the actor. The owner alone appoints and removes admins; a reply of Can't go removes the admin row.
- **New write functions, old ones kept.** `create_plan_v4` and `change_plan_v4` take the end time (required), `p_place_tbd`, `p_repeat_weeks` and (on cancel) `p_stop_repeating`; `v3` stays untouched except for the boundary, so the TestFlight build keeps working until it is replaced.
- **Mutes** are rows of `public.plan_mutes (series_id, user_id)`; `notification_recipient_eligible` skips a muted recipient, so expansion, suppression and the pre-send check all honour it.
- **Repeats.** Three `plans` columns and `private.roll_repeating_plans()`, run by pg_cron every five minutes from an owner-run script. The next occurrence is computed in the plan's `time_zone`, so clocks changing do not move it; `repeats_from` is unique, so a retry cannot create two.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, pg_cron), the Deno sender under `supabase/functions` (tested with node and tsx), the Vercel link site in `links/` (plain ES modules, `node:test`).

**Spec:** `docs/superpowers/specs/2026-10-28-creating-a-resbite-design.md`: decisions CR-D6, CR-D8, CR-D9, CR-D14, CR-D15, CR-D16; calls CR-P7, CR-P9, CR-P15 to CR-P18, CR-P21 to CR-P26; "Data"; rules 9, 11 and 12; Constraints. Plans 2 and 3 (`2026-10-28-creating-a-resbite-2-plan-screen.md`, `2026-10-28-creating-a-resbite-3-resbite-page.md`) consume the Produces blocks below by name.

## Global Constraints

- **Branch** `cr1-database`, from `main` at `22eabf3` or later. Nothing in this plan touches the hosted project, the Supabase dashboard, Vercel, EAS or TestFlight; Task 7 writes the runbook with the owner's steps.
- **The migration** is `supabase/migrations/20261031120000_creating_a_resbite.sql`. Hosted-compatible: it depends only on the files in `supabase/tests/hosted-baseline/migrations.txt`, never on the local-only `20260918001308`, `20260918001316`, `20260923152816`, `20260923152943`, `20261014130000`, `20261015130000` or `20261022120001`. Its header names the spec, this plan, "Hosted-compatible" and its rollback file.
- **SQL house pattern** (as `20261021120000_gi1_event_links.sql:27-83`): `private` SECURITY DEFINER bodies with `set search_path = ''`, `public` SECURITY INVOKER façades, `revoke all … from public, anon, authenticated, service_role` before every grant, and errors `42501` (not allowed), `22023` (invalid input or unavailable), `40001` (stale version). A function redefined here is `create or replace` with its latest body copied whole, changed only where this plan says.
- **The `notification_outbox_kind_check`** is dropped and re-added by that exact name, as every migration does; `notification_outbox_detail_check` likewise.
- **One definition per function.** A function several tasks touch (`notification_recipient_eligible`, `respond`, `require_link_owner`) has one `create or replace` in the migration, edited in place as the tasks go; the earlier tasks' tests keep passing.
- **Error texts:** `'Plan unavailable'` (22023) for a closed or cancelled plan, `'Active plan owner required' (kept: the current build matches this text)` (42501) from `require_link_owner`, `'Owner required'` (42501) for the admin functions, `'End time required'` (22023).
- **Tests:** `supabase/tests/creating-a-resbite.sql`, appended to `supabase/tests/hosted-baseline/tests.txt`; plain `begin; … rollback;` blocks with `set local role authenticated` and `request.jwt.claims`, in the style of `supabase/tests/gi1.sql`. Sender tests live beside the code in `supabase/functions/_shared/*.test.ts`; link-site tests in `links/*.test.mjs`, which `mobile/package.json`'s `test` chain already runs.
- **Commands on this Linux box:**
  - SQL, full mode: `./scripts/test-database-docker.sh`
  - SQL, hosted rehearsal: `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261031120000_creating_a_resbite.sql`
  - Sender: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`
  - Link site: `node --test links/page.test.mjs links/personal.test.mjs` and `node --import ./mobile/node_modules/tsx/dist/loader.mjs links/personal-flow.test.mjs`
- **Copy:** UK spelling; the strings the sender shows are pinned in Task 2 and Task 5.

## Review Focus

1. **A resbite that has started but not ended** (start an hour ago, end in an hour): a late reply, a change of place, a new invitation and a request decision all succeed; the web page is still `open`. Pinned in Task 1.
2. **A resbite made before this build, with no end time,** closes at its start as today, and `set_guest_note` keeps its own window (start + 1 hour). Pinned in Task 1.
3. **The clocks change between two occurrences:** the next occurrence keeps 19:00 local on both sides of the October and March changes. Pinned in Task 5 (`private.next_occurrence`).
4. **Two roll runs at once, or a retry after a crash,** create one next occurrence, not two. Pinned in Task 5.
5. **An admin who answers Can't go** loses host rights in the same transaction, and a notice never goes back to the person who caused it. Pinned in Task 2.

---

### Task 1: The end is the boundary

**Files:**
- Create: `supabase/migrations/20261031120000_creating_a_resbite.sql` (header, section "1. The end is the boundary").
- Create: `supabase/tests/creating-a-resbite.sql`.
- Modify: `supabase/tests/hosted-baseline/tests.txt` (append `creating-a-resbite.sql`).

**Interfaces:**
- Consumes: the latest bodies of `private.change_plan_v3` (`20261021120000_gi1_event_links.sql:125-164`), `private.respond` (`20261014120000_ux2_rules.sql:22-40`), `private.claim_invite` (ux2 `:43-58`), `private.create_invite` (foundation `:152-168`), `private.revoke_invite` (foundation `:228-239`), `private.set_plan_cover_if_current` (`20261007200000_plan_covers.sql:72-96`), `private.set_plan_cover_description` (ux2 `:165-186`), `private.require_link_owner` (gi1 `:27-33`), `private.invitation_page` (gi1 `:211-228`), `private.personal_invitation_page` (`20261028120000_contact_invitations.sql:197-215`), `private.check_invited_number` and `private.answer_phone_invitation` (since the phone key went live, `20261030130000_phone_key.sql:171` and `:188`, not the contact-invitations bodies), `private.claim_plan_link` (`20261029120000_open_link_approval.sql:296-311`), `private.join_by_link` (ola `:316-362`), `private.request_to_join` (ola `:88-132`), `private.plan_join_requests` (ola `:206`), `private.notification_recipient_eligible` (`20261030120000_push_delivery.sql:49-65`), the storage policies `resbite_cover_insert` and `resbite_cover_update` (plan_covers `:46-62`).
- Produces:
  - **`private.plan_end(p_starts timestamptz, p_ends timestamptz) returns timestamptz`**, `language sql immutable`, body `select coalesce(p_ends, p_starts)`. EXECUTE stays granted to `authenticated` because the two storage policies call it.
  - Every function above compares `private.plan_end(v_plan.starts_at, v_plan.ends_at) <= now()` where it compared `v_plan.starts_at <= now()` (or `starts_at > now()`), with its error text unchanged. `invitation_page` and `personal_invitation_page` say `'happened'` from the end. `plan_join_requests` returns `[]` from the end. `notification_recipient_eligible`'s `join_request` branch uses the end. The storage policies use `private.plan_end(p.starts_at, p.ends_at) > now()`.
  - `change_plan_v3`: the plan must be open (`plan_end > now()`); `p_start` is checked against `now()` only when it differs from the stored start.
  - **Unchanged:** `private.set_guest_note` keeps `coalesce(ends_at, starts_at + interval '1 hour')`; `create_plan_v3` keeps `p_start <= now()` → `'Invalid future schedule'`.

- [ ] **Step 1: Write the failing tests in `supabase/tests/creating-a-resbite.sql`,** with fixtures in the style of `gi1.sql` (an eligible owner, two eligible guests, one anonymous web visitor):
  - **running:** a plan with `starts_at = now() - interval '1 hour'`, `ends_at = now() + interval '1 hour'`: `respond` by a pending guest returns a version; `change_plan_v3` with the same start and a new place returns a version and queues `plan_changed`; `invite_contacts` returns a kind; `request_to_join` and `decide_join_request` succeed; `plan_link` returns a link; `invitation_page(code)` → `state = 'open'`; `personal_invitation_page` → `'open'`; `answer_phone_invitation` succeeds; `claim_plan_link` succeeds.
  - **ended:** the same plan with `ends_at = now() - interval '1 minute'`: each of those raises `22023 'Plan unavailable'` or `42501` (as its current error), `invitation_page` → `'happened'`, `plan_join_requests` → `'[]'`, and `notification_recipient_eligible` is false for a fresh `join_request` row.
  - **old:** a plan with `ends_at null` and `starts_at = now() - interval '10 minutes'`: `respond` → `'Plan unavailable'`; `set_guest_note` by the owner still succeeds (its window is start + 1 hour).
  - **helper:** `private.plan_end('2026-10-30 19:00+00', null) = '2026-10-30 19:00+00'` and with an end returns the end.
- [ ] **Step 2: Run** `./scripts/test-database-docker.sh`. Expected: FAIL in `creating-a-resbite.sql` at the "running" block (`'Plan unavailable'`).
- [ ] **Step 3: Write section 1 of the migration:** `plan_end`, then each redefinition in the Consumes list, latest body copied whole, one comparison changed. Drop and recreate the two storage policies with the new expression.
- [ ] **Step 4: Run** both harness modes (Global Constraints). Expected: `PASS: creating-a-resbite.sql` in both, every older test still passing.
- [ ] **Step 5: Commit** "The end is the boundary: a resbite accepts changes until it ends".

### Task 2: Admins

**Files:**
- Modify: the migration (section "2. Admins"), `supabase/tests/creating-a-resbite.sql` (append).
- Modify: `supabase/functions/_shared/notification-copy.ts` and its test file (the `admin_added` kind).

**Interfaces:**
- Consumes: Task 1; `private.can_read_plan` (foundation `:99-102`); `private.remove_guest` (ci `:158-166`); the host-notice inserts in `respond` (ux2 `:37`), `claim_invite`, `claim_plan_link`, `request_join` (ola `:71`), `answer_phone_invitation` (ci `:302`), `set_guest_note` (ux3 `:218`); the owner checks in `plan_phone_invitations` (ci `:140`), `plan_join_requests` (ola `:205`), `set_guest_note` (ux3 `:203-224`), the two cover setters and the two cover storage policies; `claim_notification_deliveries` returns `actor_name` (push_delivery `:101-144`).
- Produces:
  - **Table `public.plan_admins`**: `plan_id uuid not null references public.plans(id) on delete cascade`, `user_id uuid not null references public.profiles(id)`, `appointed_by uuid not null references public.profiles(id)`, `appointed_at timestamptz not null default now()`, primary key `(plan_id, user_id)`, index on `user_id`. RLS on; policy `plan_admins_read using (private.can_read_plan(plan_id))`; `grant select to authenticated`; no writes from clients.
  - **`private.is_host(p_plan uuid, p_user uuid) returns boolean`** (sql, stable, definer): the owner, or a `plan_admins` row.
  - **`private.host_ids(p_plan uuid) returns setof uuid`** (sql, stable, definer): the owner then the admins.
  - **`private.require_link_owner(p_plan uuid) returns uuid`** redefined: the caller must be a host of an active, open plan (`plan_end > now()`), row locked `for update`; else `42501 'Active plan owner required' (kept: the current build matches this text)`. Every existing caller (`plan_link`, `rotate_plan_link`, `remove_guest`, `invite_contacts`, `revoke_phone_invitation`, `decide_join_request`) therefore admits admins.
  - Owner checks widened to `private.is_host(...)`: `plan_phone_invitations`, `plan_join_requests`, `set_guest_note`, `set_plan_cover_if_current`, `set_plan_cover_description`, and the storage policies `resbite_cover_insert` / `resbite_cover_update` (the object stays in the owner's folder; the uploader may be any host).
  - **Host notices:** each insert that today targets `v_plan.owner_id` (`rsvp`, `invitation`, `join_request`, and `guest_note` to hosts) inserts one row per `host_ids(plan)` except the actor, dedupe key suffixed with the recipient id.
  - **`notification_recipient_eligible`:** `plan.owner_id = o.recipient_id` becomes `private.is_host(plan.id, o.recipient_id)`.
  - **`public.appoint_admin(p_plan uuid, p_user uuid) returns void`** (house pattern, authenticated): caller is the owner of an active, open plan else `42501 'Owner required'`; `p_user` must be an attendee with `response = 'accepted'` else `22023 'Only a guest who is going can be an admin'`; inserts the row (`on conflict do nothing`) and queues outbox `kind 'admin_added'`, recipient `p_user`, `actor_id` the owner, `detail null`, dedupe `'admin:'||p_plan||':'||p_user||':'||extract(epoch from now())::bigint`.
  - **`public.remove_admin(p_plan uuid, p_user uuid) returns void`** (house pattern): owner only, deletes the row; no notice.
  - **`private.respond`** redefined again: when `p_response = 'declined'`, delete the caller's `plan_admins` row for that plan (CR-P15). **`private.remove_guest`** also deletes the guest's admin row.
  - **Outbox:** `notification_outbox_kind_check` adds `'admin_added'`; the detail check allows null detail for it.
  - **Sender copy** (`notification-copy.ts`): kind `admin_added` → title `${actorName} made you an admin`, body `${title}` (the plan's title). Falls back to `Someone` as the other kinds do.

- [ ] **Step 1: Write the failing SQL tests (append):**
  - the owner appoints a Going guest: a `plan_admins` row and one `admin_added` outbox row exist; appointing a Maybe guest → `22023`; an admin appointing → `42501 'Owner required'`; the owner appointing themself → `22023`;
  - the admin can `change_plan_v3` (new place), `plan_link`, `invite_contacts`, `decide_join_request`, `remove_guest`, `set_guest_note`, `plan_phone_invitations`, `plan_join_requests`; a plain guest cannot (`42501`);
  - a guest's reply queues `rsvp` to the owner and to the admin; the admin's own reply queues `rsvp` to the owner only; `notification_recipient_eligible` is true for the admin's `rsvp` row;
  - the admin answers `declined`: the admin row is gone and the next `plan_link` call → `42501`;
  - `remove_guest` on an admin removes the admin row;
  - `anon` cannot execute `appoint_admin` or `remove_admin`.
- [ ] **Step 2: Write the failing sender test** in `supabase/functions/_shared/notification-copy.test.ts` (create it if the module has none): `admin_added` with actor "Marcos" and title "Board game night" → title `Marcos made you an admin`, body `Board game night`.
- [ ] **Step 3: Run** the SQL harness and the sender tests. Expected: both FAIL (`plan_admins` does not exist; unknown kind).
- [ ] **Step 4: Implement the Produces list** (migration section 2 and the copy case).
- [ ] **Step 5: Run** both SQL modes and the sender tests. Expected: PASS.
- [ ] **Step 6: Commit** "Admins: the owner appoints Going guests, who can do everything but appoint and remove admins".

### Task 3: `create_plan_v4` and `change_plan_v4`: end required, To be decided, repeats, cancel by hosts

**Files:**
- Modify: the migration (section "3. Plans v4"), tests (append), `supabase/README.md` (an RPC contract entry under a new "Creating a resbite (CR)" heading, in the style of the CE1 entry).

**Interfaces:**
- Consumes: Tasks 1–2; `private.create_plan_v3` (gi1 `:95-123`, the advisory-lock retry at `:100-114`), `private.change_plan_v3` (gi1 `:125-164`), `private.write_meeting_details` (ux3 `:42-53`), `plans_redact_deleting_owner` (gi1 `:188-204`).
- Produces:
  - **Columns on `public.plans`:** `place_tbd boolean not null default false`; `repeat_weeks smallint check (repeat_weeks in (1, 2))`; `series_id uuid` added, backfilled `update public.plans set series_id = id`, then `set not null`, index `plans_series_idx (series_id)`; `repeats_from uuid references public.plans(id)` with a unique index `plans_repeats_from_key`. `plans_redact_deleting_owner` is unchanged (none of these is text).
  - **`public.create_plan_v4(p_id uuid, p_title text, p_description text, p_categories text[], p_activity text, p_start timestamptz, p_ends timestamptz, p_zone text, p_place text, p_place_tbd boolean, p_repeat_weeks smallint, p_note text default '', p_lat double precision default null, p_lon double precision default null, p_area text default null) returns uuid`** (house pattern, authenticated). As v3, plus: `p_ends is null` → `22023 'End time required'`; `p_ends <= p_start` or `p_ends > p_start + interval '48 hours'` → `22023 'Invalid end time'`; `p_start <= now()` keeps `'Invalid future schedule'`; `p_repeat_weeks` must be null, 1 or 2 else `22023`; when `p_place_tbd` the stored `place_label` is `'To be decided'` and `latitude`/`longitude` are null; `series_id = p_id`, `repeats_from = null`. The retry comparison includes `ends_at`, `place_tbd` and `repeat_weeks` (a changed retry still raises `'Creation identifier already used'`).
  - **`public.change_plan_v4(p_plan uuid, p_version integer, p_title text, p_description text, p_categories text[], p_start timestamptz, p_ends timestamptz, p_zone text, p_place text, p_place_tbd boolean, p_repeat_weeks smallint, p_note text, p_area text, p_cancel boolean default false, p_stop_repeating boolean default false) returns integer`** (house pattern, authenticated):
    - the caller is a host (`is_host`) else `42501 'Host required'`; the plan is active and open else `22023 'Plan unavailable'`; version else `40001`;
    - **cancel:** `status = 'cancelled'`; `repeat_weeks = null` when `p_stop_repeating`; invitations revoked as v3; `plan_cancelled` to every attendee and every host except the actor, dedupe `'plan:'||plan||':'||version||':'||recipient`;
    - **edit:** `p_ends` required and `> now()` else `22023 'End time required'` / `'Plan unavailable'`; end within 48 hours of the start; `p_start` compared with `now()` only when it changed; a changed `p_repeat_weeks` alone sends nothing; `place_tbd` toggling counts as a place change; `plan_changed` (detail `time` / `place` / `time_place` as v3) goes to attendees with response in `('accepted','maybe','pending')` and to every host, minus the actor.
  - **`v3` stays** (Task 1's body) so the current build keeps working.

- [ ] **Step 1: Write the failing SQL tests (append):**
  - `create_plan_v4` without an end → `22023 'End time required'`; an end 3 days later → `'Invalid end time'`; with `p_place_tbd = true` and `p_place = ''` → the row has `place_label = 'To be decided'`, `place_tbd`, `series_id = id`; the same call again returns the same id; the same call with `p_repeat_weeks = 2` → `'Creation identifier already used'`; `p_repeat_weeks = 3` → `22023`;
  - `change_plan_v4` by an admin with a new place → `plan_changed` rows for the Going guest and for the owner, none for the admin; by the owner with only `p_repeat_weeks` changed → no new outbox row; cancel by the admin with `p_stop_repeating = true` → `status = 'cancelled'`, `repeat_weeks is null`, `plan_cancelled` rows for every attendee and the owner, none for the admin; cancel without the flag keeps `repeat_weeks`; a guest → `42501 'Host required'`;
  - `change_plan_v4` on a running plan (started an hour ago) with the same start and a later end succeeds; with an end in the past → `'Plan unavailable'`.
- [ ] **Step 2: Run** the harness. Expected: FAIL (`create_plan_v4` does not exist).
- [ ] **Step 3: Implement** section 3 and the README entry.
- [ ] **Step 4: Run** both modes. Expected: PASS.
- [ ] **Step 5: Commit** "Plans v4: a required end, To be decided, the repeat rule, cancelling by hosts".

### Task 4: Mutes

**Files:**
- Modify: the migration (section "4. Mutes"), tests (append).

**Interfaces:**
- Consumes: Task 3's `series_id`; `notification_recipient_eligible` as left by Task 2.
- Produces:
  - **Table `public.plan_mutes`**: `series_id uuid not null`, `user_id uuid not null references public.profiles(id) on delete cascade`, `muted_at timestamptz not null default now()`, primary key `(series_id, user_id)`. RLS on; policy `plan_mutes_own using (user_id = (select auth.uid()))`; `grant select to authenticated`.
  - **`public.set_plan_mute(p_plan uuid, p_muted boolean) returns boolean`** (house pattern, authenticated): the caller must be a host or an attendee of the plan else `42501`; inserts or deletes the row for the plan's `series_id`; returns `p_muted`.
  - **`notification_recipient_eligible`** gains `and not exists (select 1 from public.plan_mutes m where m.series_id = plan.series_id and m.user_id = o.recipient_id)`, for every kind.

- [ ] **Step 1: Write the failing SQL tests (append):** a Going guest mutes → `set_plan_mute` returns true, the row exists, and `notification_recipient_eligible` is false for a fresh `plan_changed` row to them and for an `rsvp` row to a muted owner; unmute → true again; a stranger → `42501`; the guest can `select` their own row and not another's.
- [ ] **Step 2: Run** the harness. Expected: FAIL.
- [ ] **Step 3: Implement** section 4.
- [ ] **Step 4: Run** both modes. Expected: PASS.
- [ ] **Step 5: Commit** "Mute this resbite: one row per person and series, honoured by the sender".

### Task 5: Repeating resbites roll one occurrence ahead

**Files:**
- Modify: the migration (section "5. Repeats"), tests (append).
- Create: `supabase/ops/schedule-roll-repeating-plans.sql`.
- Modify: `supabase/functions/_shared/notification-copy.ts` and its test (the `invited` kind with detail `again`).

**Interfaces:**
- Consumes: Tasks 3–4; `public.plan_meeting_details`; `plans_fill_from_activity` and `plans_track_cover_revision` triggers; the `resbite_cover_read` storage policy (plan_covers `:65-70`); the outbox `invited` kind (ci `:118`).
- Produces:
  - **`private.next_occurrence(p_at timestamptz, p_zone text, p_weeks integer) returns timestamptz`** (sql, stable, definer, no grant): `((p_at at time zone p_zone) + make_interval(weeks => p_weeks)) at time zone p_zone`.
  - **`private.roll_repeating_plans() returns integer`** (plpgsql, definer, `set search_path = ''`, revoked from every role, no grant; pg_cron runs it as `postgres`). For each plan `p` with `repeat_weeks is not null`, no row with `repeats_from = p.id`, and (`status = 'cancelled'` or `plan_end(p.starts_at, p.ends_at) <= now()`), locked `for update skip locked`:
    1. `v_start := next_occurrence(p.starts_at, p.time_zone, p.repeat_weeks)`, `v_end := next_occurrence(p.ends_at, …)`; while `plan_end(v_start, v_end) <= now()` advance both by another `repeat_weeks` (at most 600 steps), so the next occurrence is always the first one after now;
    2. insert the new plan with `id = gen_random_uuid()`, `owner_id`, `activity_id`, `title`, `description`, `categories`, `starts_at = v_start`, `ends_at = v_end`, `time_zone`, `place_label`, `place_tbd`, `latitude`, `longitude`, `area`, `guest_note`, `guest_note_at`, `cover_path`, `cover_revision`, `cover_description`, `has_meeting_details`, `repeat_weeks`, `series_id = p.series_id`, `repeats_from = p.id`, `status 'active'`, `version 1`;
    3. copy the `plan_meeting_details` row, the `plan_admins` rows (`appointed_at = now()`), and every attendee with `response <> 'withdrawn'` as `response 'pending'`, `version 1`;
    4. one outbox row per copied attendee who is not an admin of the new occurrence (the owner and the admins get no push, CR-P24): `kind 'invited'`, `detail 'again'`, `actor_id` the owner, dedupe `'invited:'||new_id||':'||user_id`;
    5. count it. A unique violation on `repeats_from` (a concurrent run) is caught and skipped.
  - **Outbox:** the detail check allows `'again'` for `'invited'`.
  - **Cover reads:** if `resbite_cover_read` ties an object to one plan id, it is widened so any plan the reader can read whose `cover_path` names the object grants the read (the next occurrence shares the photo). If it already works by `cover_path`, nothing changes; the test says which.
  - **Sender copy:** `invited` with detail `again` → title `${title} is on again`, body the start formatted as the other kinds format a date and time (`notification-copy.ts` already formats `starts_at` in `time_zone`).
  - **`supabase/ops/schedule-roll-repeating-plans.sql`** (owner-run, in the style of `schedule-deliver-notifications.sql`): `create extension if not exists pg_cron with schema pg_catalog;` the unschedule guard for `'roll-repeating-plans'`, then `select cron.schedule('roll-repeating-plans', '*/5 * * * *', $job$ select private.roll_repeating_plans(); $job$);`. No pg_net.

- [ ] **Step 1: Write the failing SQL tests (append):**
  - `private.next_occurrence('2026-10-22 18:00+00', 'Europe/London', 1) = '2026-10-29 19:00+00'` (clocks back on 25 Oct) and `('2027-03-25 19:00+00', 'Europe/London', 1) = '2027-04-01 18:00+00'` (clocks forward on 28 Mar); with 2 weeks, 14 days on;
  - a weekly plan created with `create_plan_v4` on a Thursday, then `starts_at`/`ends_at` moved to last week by a direct update (as the owner-fixture superuser), with a Going guest, a Can't-go guest, a pending guest, a withdrawn attendee, an admin, a meeting-details row and a mute by the Going guest: `roll_repeating_plans()` returns 1; the new row has `repeats_from = old.id`, the same `series_id`, `(starts_at at time zone 'Europe/London')::time = '19:00'`, `extract(dow from starts_at at time zone 'Europe/London') = 4`, `starts_at > now()`, `starts_at <= now() + interval '7 days'`; attendees are the four non-withdrawn users (the admin among them), all `pending`; the admin row exists; the meeting-details row exists; three `invited` rows with detail `again` and none for the admin; `notification_recipient_eligible` is false for the Going guest's row (the mute carried) and true for the others;
  - a second call returns 0 and there is still one next;
  - an occurrence cancelled with `change_plan_v4(..., p_cancel => true)` (no stop) rolls; one cancelled with `p_stop_repeating => true` does not; one edited to `p_repeat_weeks => null` does not;
  - a plan whose last occurrence ended 30 days ago rolls to an occurrence in the future, within 7 days;
  - `anon` and `authenticated` cannot execute `roll_repeating_plans` (`42501`).
- [ ] **Step 2: Write the failing sender test:** `invited` with detail `again`, title "Board game night" → title `Board game night is on again`, body containing the formatted date.
- [ ] **Step 3: Run** the SQL harness and the sender tests. Expected: FAIL.
- [ ] **Step 4: Implement** section 5, the ops script and the copy case. Read `resbite_cover_read` before deciding whether it changes; say so in the commit message.
- [ ] **Step 5: Run** both SQL modes and the sender tests. Expected: PASS.
- [ ] **Step 6: Commit** "Repeating resbites: the next occurrence is created when this one ends, people invited again".

### Task 6: The web pages follow

**Files:**
- Modify: the migration (section "6. Web payloads"), tests (append).
- Modify: `links/server/lib/render.mjs` (`formatWhen` `:30-52`, the closed page `:111-119`), `links/server/lib/personal.mjs` (`PERSONAL_WORDS` `:31-46`, `stepsBody` `:121-122`, `data-starts-at` at `:134`), `links/assets/personal.js` (`:78`, `:320`), `links/page.test.mjs`, `links/personal.test.mjs`.

**Interfaces:**
- Consumes: Task 1's `happened` state; Task 3's columns.
- Produces:
  - `private.invitation_page` and `private.personal_invitation_page` open payloads gain `place_tbd boolean` and `repeat_weeks smallint|null`. `my_join_request` (ola `:138-157`) reuses `invitation_page` unchanged.
  - **`repeatLine(startsAt, timeZone, repeatWeeks)`** exported from `links/server/lib/render.mjs`: `null` when `repeatWeeks` is null; `"Every Thursday"` for 1 and `"Every other Thursday"` for 2, the weekday taken in `timeZone` (`Intl.DateTimeFormat(…, {weekday: 'long', timeZone})`).
  - Both open pages render the repeat line as a `<p class="detail">` under the time line; a `place_tbd` plan adds the line `"Place to be decided"` in the same spot (the pages show no other place today).
  - `personal.mjs` writes `data-ends-at` (the end, or the start when there is none) and `assets/personal.js` drops the kept session from that instant instead of the start.

- [ ] **Step 1: Write the failing SQL tests (append):** `invitation_page` for an open weekly plan returns `repeat_weeks = 1` and `place_tbd = false`; for a `place_tbd` plan, `true`.
- [ ] **Step 2: Write the failing link-site tests:** in `page.test.mjs`, a payload with `repeat_weeks: 1` and `starts_at` on a Thursday in `Europe/London` renders `Every Thursday`, and `place_tbd: true` renders `Place to be decided`; `repeatLine('2026-10-29T19:00:00Z', 'Europe/London', 2) === 'Every other Thursday'`; in `personal.test.mjs`, the page carries `data-ends-at` with the end and no `data-starts-at`.
- [ ] **Step 3: Run** the harness and `node --test links/page.test.mjs links/personal.test.mjs`. Expected: FAIL.
- [ ] **Step 4: Implement** section 6 and the link-site changes.
- [ ] **Step 5: Run** both SQL modes, the two link tests and `node --import ./mobile/node_modules/tsx/dist/loader.mjs links/personal-flow.test.mjs`. Expected: PASS.
- [ ] **Step 6: Commit** "Web pages: happened from the end, Every Thursday, Place to be decided".

### Task 7: Rollback, rehearsal files and the runbook

**Files:**
- Create: `supabase/rollback/20261031120000_creating_a_resbite.rollback.sql`.
- Create: `supabase/tests/hosted-baseline/20261031120000_creating_a_resbite.before.sql` and `.after.sql`, in the style of the `20261030120000_push_delivery` pair.
- Create: `qa/creating-a-resbite-2026-10-31/README.md`.
- Modify: `docs/implementation-status.md` (a dated line under the current summary pointing at the runbook).

**Interfaces:**
- Consumes: everything above.
- Produces:
  - The rollback drops, in reverse order, the roll and helper functions, `plan_mutes`, `plan_admins`, `appoint_admin`/`remove_admin`/`set_plan_mute`, the v4 functions, the four `plans` columns and their indexes, restores the kind and detail checks, the two storage policies and every redefined function to its previous body (copied from its previous migration), and leaves `plan_end` dropped last.
  - The `.before.sql` asserts the pre-state (no `plan_admins`, `invitation_page` happened at the start); the `.after.sql` asserts the post-state (the columns, `happened` at the end, `roll_repeating_plans` present and revoked).
  - The runbook lists, each as an owner step needing explicit approval: the migration's file name and sha256 (`sha256sum`), the apply commands from `supabase/README.md` (`supabase db query --linked -f` wrapped in `begin`/`commit`, then `supabase migration repair --status applied 20261031120000 --linked --yes`), the fingerprint and counts snapshots before and after, the cron script to paste with `! bash` (short lines), the `deliver-notifications` redeploy (the copy module changed), the `links/` production deploy, and the note that the TestFlight build with Plans 2 and 3 must ship before the cron job is created (an old build cannot show the rolled occurrences' end times, but it can open them).

- [ ] **Step 1: Write the rollback and the two rehearsal files.**
- [ ] **Step 2: Run** `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261031120000_creating_a_resbite.sql`. Expected: the before file passes against the baseline, the migration applies, the after file passes, `creating-a-resbite.sql` passes.
- [ ] **Step 3: Verify the rollback** by appending a temporary block to a scratch copy of the test run: apply the rollback after the migration on the Docker database and re-run `supabase/tests/gi1.sql`, `ux2.sql`, `contact-invitations.sql`, `open-link-approval.sql` and `push-delivery.sql`. Expected: PASS. Remove the scratch.
- [ ] **Step 4: Write the runbook** and the status line.
- [ ] **Step 5: Commit** "Creating a resbite: rollback, hosted rehearsal and the owner's runbook".
