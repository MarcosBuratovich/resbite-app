# Open-Link Approval (Plan 3 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The open event link (`link.resbite.com/r/<code>`) no longer lets anyone in on its own. Whoever answers through it, on the web or in the app, becomes a waiting request. The host sees "Waiting for you" on the event page and approves or declines each one. Approval makes them a normal guest with their answer and grants beta access. Decline tells them only that they weren't added.

**Architecture:**
- **Database:** a new table `private.join_requests` holds one row per (event, person) with their answer and status (`waiting`, `approved`, `declined`). Waiting people never hold an `attendees` row, so they can't read the plan, aren't counted, and see no guests, place or meeting details.
- **Redefined functions:** `claim_plan_link` and `join_by_link` create a request instead of admitting the person.
- **New functions:**
  - `request_to_join` (web and app) and `my_join_request` (anyone with a session);
  - `my_join_requests` (the app's list) and `change_join_answer` (the app's waiting screen);
  - `plan_join_requests` and `decide_join_request` (host).
- **Web:** `/r/<code>` reuses Plan 2's personal-page client in an "open" mode: no number match, and a waiting screen instead of "You're going".
- **App:** opening a `/r/` link sends a request and shows a waiting screen. My resbites lists waiting requests. The host's event page gains "Waiting for you" and the event link card, which moves there from Invite people. GI2's email-code guest screen is retired in favour of phone sign-in.

**Tech Stack:** Supabase Postgres, Expo SDK 57 / React Native, the Vercel link site (`links/`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-contact-invitations-design.md`: CI-D1, CI-D9; flow 6; "What changes from GI1 and GI2". Push for requests and approvals is Plan 4; this plan only queues outbox rows. Plans 1–2 are merged: phone accounts, personal invitations, `links/assets/personal-flow.mjs` / `personal.js` / `personal.css`, `links/server/lib/personal.mjs`.

## Global Constraints

- **Branch:** `open-link-approval`, from `main`.
- **No external side effects:** nothing touches hosted, the dashboard, Vercel, EAS or TestFlight. Task 8 writes the runbook.
- **SQL house pattern:**
  - `private` SECURITY DEFINER bodies with `set search_path=''`, plus `public` SECURITY INVOKER façades;
  - anon functions are single SECURITY DEFINER functions in `public`;
  - explicit revokes before grants;
  - errors `42501`, `22023` and `40001`;
  - per-user advisory lock `pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(<uuid>::text,47))` taken before plan row locks.
- **The new migration** is `supabase/migrations/20261029120000_open_link_approval.sql`. It is hosted-compatible: it depends on the hosted-baseline list plus `20261027120000_phone_accounts.sql` and `20261028120000_contact_invitations.sql`.
  - Hosted-baseline runs pass all three candidates in order.
  - Redefinitions copy their latest bodies verbatim, changing only what this plan states, with grants unchanged.
  - The rollback restores them byte-for-byte, and the rehearsal proves it, in the model of `20261028120000_contact_invitations.before.sql`/`.after.sql`.
- **Waiting people:**
  - they never get an `attendees` row or a live `beta_access` grant;
  - approval is the only path to both;
  - a revoked grant (a ban), a disabled roster row, an ineligible organizer, a turned-off link, or a cancelled or started event refuses a request (42501 "Invitation unavailable");
  - the owner and existing attendees are never turned into requests.
- **Outbox:** new kinds `join_request` (to the host, actor the requester) and `join_approved` (to the requester, actor the host). Declines queue nothing.
- **Copy:** app strings go in `mobile/src/domain/inviteCopy.ts` (or `eventLinks.ts` for link copy); web strings go in `links/assets/personal-flow.mjs` `PAGE_COPY`. Test mode's 000000 never appears.
- **Commands:**
  - SQL: `./scripts/test-database-docker.sh [--hosted-baseline supabase/migrations/20261027120000_phone_accounts.sql supabase/migrations/20261028120000_contact_invitations.sql supabase/migrations/20261029120000_open_link_approval.sql]`
  - Worker tests: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`
  - App: `cd mobile && npm run check`
  - Web: `cd mobile && node --import tsx ../links/verify-personal.mjs` (and the new `verify-open-link.mjs`)
  - Browser: Expo web with `EXPO_PUBLIC_SUPABASE_URL=https://ewcsgvhuojxdpaspwsrx.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=qa-fixture-key npx expo start --web --port 8081`, every request intercepted, stopped by exact PID. Never create `mobile/.env.local`.

## Review Focus

1. **Someone who already answered through the open link opens it again** (web or app) and sees their waiting answer, which they can change while waiting. Nothing gets duplicated. Pinned in Task 1 (SQL) and Task 4 (web check).
2. **The host approves a request after the link was turned off or the event was edited:** approval still works. If the event is cancelled or started, approval is refused, and the request stays waiting with a clear message. Pinned in Task 1.
3. **An old TestFlight build (8/10)** calling `claim_plan_link` or `join_by_link` gets no admission. The functions return the plan id, but the person holds no attendee row. Pinned in Task 1.
4. **A declined person who opens the link again** sees "You weren't added to this resbite." and can't re-request on the same link. A new link (Turn off, then a new code) lets them ask again. Pinned in Task 1 and Task 4.
5. **The guest list, the going count and the event page** never include waiting people. Pinned in Task 1 (`invitation_page` going count, attendee RLS) and Task 6 (host view).

---

### Task 1: Join requests in the database

**Files:**
- Create: `supabase/migrations/20261029120000_open_link_approval.sql`, `supabase/tests/open-link-approval.sql`.
- Modify: `supabase/tests/hosted-baseline/tests.txt`.

**Interfaces (Produces):**
- **Table `private.join_requests`:**
  - columns: `plan_id uuid not null references public.plans(id) on delete cascade`, `user_id uuid not null references auth.users(id) on delete cascade`, `plan_link_id uuid references private.plan_links(id) on delete set null`, `response text not null check (response in ('pending','accepted','maybe','declined'))`, `status text not null default 'waiting' check (status in ('waiting','approved','declined'))`, `created_at timestamptz not null default now()`, `decided_at timestamptz`;
  - primary key `(plan_id, user_id)`;
  - RLS on, no client grants.
- **Checks:** the outbox kind check adds `'join_request','join_approved'`, and `beta_access` source adds `'approval'`. Redefine both by name, keeping every existing value.
- **`private.request_join(p_uid uuid, p_link private.plan_links, p_plan public.plans, p_response text) returns jsonb`**, an internal helper with no grants. It returns `{state: 'owner'|'already'|'waiting'|'declined', plan_id, response}`.
  - The owner gives `owner`; an existing attendee gives `already` with their response. Neither writes anything.
  - A `declined` row for the same `plan_link_id` gives `declined`. A declined row from an older link is reopened as `waiting`.
  - Otherwise it upserts `waiting` with the response, and queues `join_request` to the owner only when the row is new: dedupe `'join:'||plan||':'||uid||':'||coalesce(link,'')`.
- **`public.request_to_join(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb`** (house pattern, authenticated). Steps, in this order:
  1. session;
  2. the per-user lock;
  3. the account is confirmed (email or phone), not anonymous, not banned and not deleting;
  4. a revoked grant, or a disabled roster row for the caller's email → 42501;
  5. the link must be live; the plan locked, active, in the future and owned by a `user_eligible` organizer; else 42501 "Invitation unavailable";
  6. `p_response` must be in (`pending`,`accepted`,`maybe`,`declined`); else 22023;
  7. the attestation (`p_terms_version`) is required if none is stored; the profile (`p_name` 1–80) is required if none exists. Same rules and messages as `answer_phone_invitation`;
  8. `private.request_join`.
- **`public.my_join_request(p_code text) returns jsonb`** (house pattern, authenticated): `invitation_page(p_code)` plus `request: {status, response} | null` for the caller on that link's plan, plus `member: 'owner'|'attendee'|null`.
- **`public.my_join_requests() returns jsonb`** (house pattern, authenticated): `[{plan_id, title, starts_at, ends_at, time_zone, host, area, image, response, status}]` for the caller's requests that are `waiting` or `declined` on active, future plans. It never returns the place.
- **`public.change_join_answer(p_plan uuid, p_response text) returns jsonb`** (house pattern, authenticated): session and the per-user lock; `p_response` in the four values, else 22023; updates the caller's `waiting` request on that plan and returns `{status:'waiting', response}`. No waiting request (none, approved or declined) → 22023 "Request already decided". No outbox row. The app's waiting screen uses this, since it knows the plan but not always the code.
- **`public.plan_join_requests(p_plan uuid) returns jsonb`** (house pattern, owner only, 42501 otherwise): `[{user_id, name, response, ending, created_at}]` for `waiting` rows. `name` comes from `profiles.display_name`; `ending` is the last two digits of `auth.users.phone`, or `null`.
- **`public.decide_join_request(p_plan uuid, p_user uuid, p_approve boolean) returns jsonb`** (house pattern):
  - `require_link_owner(p_plan)`: the owner of an active, future plan, with the plan locked;
  - the row must be `waiting`, else 22023 "Request already decided";
  - **approve:**
    - insert the attendee with the request's response, mapping `pending`, `accepted`, `maybe` and `declined` to the same attendee responses;
    - grant `beta_access(source 'approval')` unless the user is already `user_eligible`, has a revoked grant, or has a disabled roster row. In the last two cases, refuse 42501 and leave the request waiting;
    - status `approved`, `decided_at`;
    - outbox `join_approved` to the user.
  - **decline:** status `declined`, `decided_at`.
  - Returns `{status}`.
- **Redefined `private.claim_plan_link`** (latest body in `20261021120000_gi1_event_links.sql`): the owner or an existing attendee keeps today's behaviour, returning the plan id from any link. Everyone else, on a live link to an open event, gets `private.request_join(…,'pending')` and the plan id, with no attendee row. Refusals are unchanged.
- **Redefined `private.join_by_link`** (latest body in `20261027120000_phone_accounts.sql`): identical checks, attestation and profile creation, but instead of the grant, the attendee and the `invitation` outbox row, it calls `private.request_join(…,'pending')`. It returns the plan id.
- `invitation_page` is unchanged: `going` counts attendees only.

- [ ] **Step 1: Write failing SQL tests in `open-link-approval.sql`** (model: `contact-invitations.sql`):
  - **request:**
    - a phone-only user with no grant requests `accepted` with name `'Ana'` and terms `'2026-10'`. This creates a profile, an attestation, a `waiting` row and one `join_request` outbox row to the host, with no attendee and no grant; `user_eligible` stays false;
    - a second request with `maybe` updates the response and adds no outbox row (Review Focus 1);
    - the owner gives `owner`; an attendee gives `already`;
    - a banned user, a disabled roster email, a turned-off link, a cancelled or started event, and an ineligible organizer each give 42501;
    - `'nope'` gives 22023.
  - **change_join_answer:** a waiting user changes `accepted` → `maybe` with no outbox row; after a decision it gives 22023 "Request already decided"; another user's plan with no request gives 22023.
  - **my_join_request / my_join_requests:**
    - they show the status and response and never `place_label`;
    - another user's request is invisible.
  - **plan_join_requests:** the host sees name, response and ending; a non-owner gets 42501.
  - **decide:**
    - approve gives an attendee with response `accepted`, `beta_access source='approval'`, `user_eligible` true, a `join_approved` outbox row and status `approved`;
    - deciding again gives 22023;
    - decline gives status `declined` with no attendee and no outbox row;
    - after decline, `request_to_join` on the same link gives `declined`. After `rotate_plan_link`, the new link reopens `waiting` (Review Focus 4);
    - approve after the link was turned off works; approve on a cancelled event gives 42501 and the row stays waiting (Review Focus 2);
    - approve for a banned user gives 42501 and the row stays waiting.
  - **legacy:** `claim_plan_link` and `join_by_link` by a new user return the plan id, create a `waiting` row, and insert no attendee and no grant. The owner and attendees keep today's behaviour (Review Focus 3).
  - **visibility:** a waiting user cannot select the plan (RLS), and `invitation_page.going` doesn't count them (Review Focus 5).
  - **grants:** anon cannot execute any new public function, and `request_join` is not executable by any client role.
- [ ] **Step 2: Run** both harness modes. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both modes. Expected: `PASS: open-link-approval.sql` in each.
- [ ] **Step 5: Commit** "Turn open-link answers into requests the host approves".

### Task 2: Rollback and hosted rehearsal

**Files:**
- Create: `supabase/rollback/20261029120000_open_link_approval.rollback.sql`, `supabase/tests/hosted-baseline/20261029120000_open_link_approval.before.sql` and `.after.sql`.

**Interfaces:** the rollback:
- restores `claim_plan_link`, `join_by_link` and both checks verbatim;
- deletes `join_request`/`join_approved` outbox rows first, and turns every `approval` grant into a `link` grant (live stays live, revoked stays revoked: a ban stays a ban), saying so in its header. Approved guests keep their attendee rows and their access, as they would have had under GI2;
- drops the table and the new functions.

The rehearsal fingerprints definitions, ACLs, constraints and the `private` schema ACL, and proves an exact restore, like Plan 2's.

- [ ] **Step 1: Write the rehearsal checks, then the rollback.** Run the hosted-baseline mode with all three candidates. Expected: applies, the after-checks pass, and `PASS: open-link-approval.sql (hosted baseline)`.
- [ ] **Step 2: Commit** "Add the open-link approval rollback and its rehearsal".

### Task 3: App services for requests

**Files:**
- Create: `mobile/src/services/joinRequests.ts` and `joinRequests.test.ts`; add to the test chain.

**Interfaces:**
- `type JoinState = "owner" | "already" | "waiting" | "declined"`
- `type MyRequest = { plan_id: string; title: string; starts_at: string; ends_at: string | null; time_zone: string; host: string; area: string; image: { kind: string; ref: string | null }; response: string; status: "waiting" | "declined" }`
- `type HostRequest = { user_id: string; name: string; response: string; ending: string | null; created_at: string }`
- `joinRequestGateway`:
  - `request(code, response, name?, termsVersion?): Promise<{ state: JoinState; plan_id: string; response: string }>`
  - `mine(): Promise<MyRequest[]>`
  - `change(plan, response): Promise<string>` (calls `change_join_answer`, returns the stored response)
  - `forPlan(plan): Promise<HostRequest[]>`
  - `decide(plan, user, approve): Promise<"approved" | "declined">`

  It uses `withDeadline` and injectable rpc, as `contactInvites.ts` does.
- `joinErrorMessage(e)`: 42501 → "This link isn’t open to you right now."; "Request already decided" → "Someone already answered this request."; 22023 passes through; otherwise the connection copy.

- [ ] **Step 1:** write failing tests for mapping and errors. **Step 2:** implement. **Step 3:** `npm run check`. **Step 4: Commit** "Call the join request RPCs from the app".

### Task 4: The open link page on the web

**Files:**
- Modify:
  - `links/server/lib/render.mjs` / `links/server/api/page.mjs`: the `/r/` open state renders the same step containers and `data-` attributes as `/i/`, plus `data-mode="open"`. Use the `/i/` CSP for open `/r/` pages; closed states keep the strict CSP.
  - `links/assets/personal-flow.mjs` and `personal.js`: an open mode.
  - `links/assets/personal.css`.
  - `links/generate.mjs` if assets or headers change.
  - `links/page.test.mjs`, `links/personal-flow.test.mjs`.
- Create: `links/verify-open-link.mjs`, modelled on `verify-personal.mjs`, run from `mobile/` with tsx; add it to the docs' command list.

**Interfaces:**
- **Open mode (`data-mode="open"`):**
  - no "This invitation is for the number ending" note and no `check_invited_number`;
  - the page renders `data-country="44"` (the calling code `composeNumber` uses for numbers typed without `+`; the beta is in the UK), and the number step adds `PAGE_COPY.outsideUk = "Outside the UK? Start with + and your country code."`;
  - after verify, the answer step offers Going, Maybe and Can't go, and submits `request_to_join` with `{p_code,p_name,p_response,p_terms_version}`.
- **Done screen in open mode:**
  - `waiting` → `PAGE_COPY.waitingHeading = "Waiting for <host>"` and `PAGE_COPY.waitingBody = "<host> will confirm your spot."`, then the same get-the-app block (direction A list, Get Resbite, Not now);
  - `declined` → `PAGE_COPY.notAdded = "You weren’t added to this resbite."` with only "Plan your own with Resbite.";
  - `already` or `owner` → `PAGE_COPY.alreadyIn = "You’re on this resbite."` with "Open Resbite" (`resbite://r/<code>`) and Get Resbite.
- **Coming back:** a stored session (keyed by code, as Plan 2) calls `my_join_request` and shows the right screen. While `waiting`, the answer can be changed (`request_to_join` again).
- "Not you? Sign out" works as in Plan 2.

- [ ] **Step 1: Write failing node tests** for the open-mode reducer and the screen choice by state, and **`verify-open-link.mjs` cases:**
  1. full flow to waiting, with exact request bodies;
  2. reload shows waiting and allows changing the answer;
  3. declined shows `notAdded`;
  4. already shows `alreadyIn`;
  5. no 000000 and no third-party hosts.
- [ ] **Step 2: Implement.** Run the node tests, `verify-open-link.mjs`, `verify-personal.mjs` and `npm run check`.
- [ ] **Step 3: Commit** "Let people answer an open link on the web and wait for the host".

### Task 5: Opening an open link in the app, and the waiting list

**Files:**
- Modify:
  - `mobile/app/invite.tsx` and `mobile/src/state/useGuestAccount.ts`: retire the GI2 email-code guest flow.
    - A signed-out `/invite?code=` shows the invitation card (from `invitation_page`, as GI2 reads it), plus "Sign up to reply" (→ `/auth/phone`) and "I have an account" (→ `/auth/phone?intent=signin`). The code stays kept through `rememberInvite`, as today.
    - Signed in, with any access status but a verified phone, the code path calls `joinRequestGateway.request(code, "pending")` and routes:
      - `owner`/`already` → `/event?plan=`;
      - `waiting` or `declined` → `/waiting?plan=<plan_id>`.
  - `mobile/app/account.tsx`: an `access_pending` account with a kept link code goes to `/invite?code=` (as today).
  - `mobile/app/(tabs)/plans.tsx`: the Invitations section also lists `mine()` requests. `waiting` shows a "Waiting for <host>" chip; `declined` shows "Not added". Tapping opens `/waiting?plan=`.
- Create:
  - `mobile/app/waiting.tsx` (`/waiting?plan=`): reads the request from `mine()`; when it isn't listed (approved, or the event is gone) it replaces itself with `/event?plan=`. Shows the invitation card (title, time, area, host, image); "Waiting for <host>"; the answer `Segmented` (Going / Maybe / Can't go) that calls `change`; Done. The declined state shows "You weren’t added to this resbite." It is reachable while `access_pending`, so add it to the session-guarded `Stack.Protected` group in `_layout.tsx`.
  - `mobile/src/domain/joinView.ts` with tests: pure helpers for state → copy and chip.
- Delete or stop using:
  - `src/services/emailCode.ts` and the GI2 email steps in `src/design/GuestSteps.tsx`, unless other code uses them;
  - `guestJoin.ts`'s `join_by_link` call, replaced by `request`.

  Keep `appleSignIn` and Google.
- Copy, in `inviteCopy.ts`: `waitingFor(host)`, `notAdded`, `signUpToReply`, `iHaveAccount`.

- [ ] **Step 1: Write failing `joinView` tests.** **Step 2: Implement.** Run `npm run check` and smoke-load `/invite?code=` signed out and signed in, plus `/waiting`. **Step 3: Commit** "Send open-link answers from the app as requests and show them waiting".

### Task 6: The host's Waiting for you, and the event link on the event page

**Files:**
- Modify:
  - `mobile/app/event.tsx` and `mobile/src/state/useEvent.ts` (owner only):
    - a "Waiting for you" section above the guests, from `forPlan`. Each row shows name, answer, "via event link" and `••<ending>`, with Approve and Decline buttons. Decline asks to confirm. After a decision, reload. Errors use `joinErrorMessage`.
    - the event link card: "Event link", "Anyone can answer with it, and you approve them first.", Share, Copy, Turn off. Move it from `app/invitations.tsx`'s bottom section, reusing its code and `invitationGateway`.
  - `mobile/app/invitations.tsx`: remove the event link section.
  - `mobile/src/domain/eventLinks.ts`:
    - `removeGuestQuestion(name)` = "Remove <name> from this resbite? They can ask to join again with the event link, and you’ll decide.";
    - `LINK_INFO` says answers through the link wait for your approval.

  Keep `TURN_OFF_*` unchanged.
  - `mobile/src/domain/inviteCopy.ts`: `waitingForYou`, `viaLink`, `approve`, `decline`, `declineQuestion(name)` = "Decline <name>? They’ll see they weren’t added.", plus hints for the buttons.

- [ ] **Step 1: Implement.** Run `npm run check`. **Step 2: Commit** "Let hosts approve open-link answers on the event page, where the event link now lives".

### Task 7: Browser checks and captures

**Files:**
- Create: `mobile/scripts/verify-open-link-app.mjs`.
- Modify: `verify-links.mjs` (the GI2 guest cases become the new signed-out screen and requests), `verify-invitations.mjs` (the event link section is gone), `verify-event.mjs` (Waiting for you, the moved link card), `verify-contact-invites.mjs` if affected, `review-ui.mjs` (captures: `/waiting` in both states, the signed-out invite, the host's Waiting for you, the link card, at 390/320 and Larger Text 320).

- [ ] **Step 1: Write the cases:**
  1. Signed in, opening `/invite?code=` sends `request_to_join` with `p_response:"pending"` and lands on `/waiting?plan=`. Changing the answer sends `change_join_answer`.
  2. Signed out, the invite screen shows the card and "Sign up to reply" → `/auth/phone`, with the code kept.
  3. My resbites lists a waiting request with "Waiting for Sam" and a declined one with "Not added".
  4. The host sees Waiting for you with name, answer and `••34`. Approve sends `decide_join_request` with `p_approve:true` and the row leaves. Decline confirms, then sends `false`.
  5. The event link card on the event page offers Share, Copy and Turn off. Invite people has no link section.
  6. No 000000 anywhere.
- [ ] **Step 2: Run** every `verify-*.mjs`, `review-ui.mjs`, `verify-personal.mjs`, `verify-open-link.mjs`, the iOS export (remove `dist-ios`) and `npm run check`. Expected: all exit 0.
- [ ] **Step 3: Commit** "Check open-link requests, waiting and approval in the browser".

### Task 8: Records and rollout runbook

**Files:**
- Create: `qa/open-link-approval-2026-10-29/README.md`.
- Modify: `docs/implementation-status.md`, `knowledge-base/08-decisions.md`, `supabase/README.md`.

- [ ] **Step 1: Runbook.** None of these steps is run in this task.
  1. **Migration:** owner approval by name and sha256; applied straight after `20261028120000_contact_invitations.sql`; snapshots; advisors.
  2. **Link site** redeploy (the `/r/` open page changes).
  3. **App build:** the same build as Plans 1–2.
  4. **iPhone checks:**
     - answer an open link on a phone without Resbite and see Waiting;
     - the host approves and the guest appears;
     - a declined person sees Not added;
     - turning the link off doesn't remove approved guests.
  5. **Old builds:** opening `/r/` links now waits silently (the event page says it isn't available). Ask testers to update.
  6. **Rollback:** approved guests stay, with their access (approval grants become link grants). Request notices are deleted.
- [ ] **Step 2:** update the docs and record this plan's calls. Run all checks one last time. **Step 3: Commit** "Record open-link approval: decisions, status and the rollout runbook".
