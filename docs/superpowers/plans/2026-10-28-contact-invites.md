# Contact Invitations (Plan 2 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host invites people from their phone contacts:
- **Already on Resbite:** a contact who has used the app gets the invitation in the app.
- **Not on Resbite:** everyone else gets a personal link to `link.resbite.com/i/<code>`. There they confirm the invited number with a code, answer, and see the "get the app" screen (direction A). Signing into the app later with that number finds the event already there.
- **Existing accounts:** an account that adds a number already held by a web-only account folds that account into itself.

**Architecture:**
- **Invitations:** a new table `private.phone_invitations` holds one row per (event, number). The app makes each personal code; the server stores only its SHA-256. The host's phone keeps the codes, so links can be sent again.
- **Host side:** host RPCs look up which picked numbers are "On Resbite", invite a batch, list invitations and revoke one.
- **Invitee side:** anonymous RPCs feed the web page. One authenticated RPC records a verified invitee's answer and grants beta access.
- **The web page** is server-rendered like `/r/`. A small same-origin module script runs the steps: tick, number, code, name, answer, get the app. It calls Supabase Auth and REST directly with the publishable key, under a CSP that allows only that host.
- **Folding** a web-only account into an existing one is a service-role Edge Function. It is gated off in source until the owner approves it.

**Tech Stack:** Supabase Postgres and Auth, Deno Edge Functions (tested under node with tsx), Expo SDK 57 / React Native (expo-contacts, expo-crypto, Linking), `libphonenumber-js` (already pinned), a Vercel serverless page in `links/`, vanilla ES modules for the web page, Playwright for browser checks.

**Spec:** `docs/superpowers/specs/2026-10-27-contact-invitations-design.md`:
- decisions CI-D1 to CI-D6 and CI-D11; CI-P1, CI-P3 to CI-P7;
- flows 1 (the host invites), 2 (an invitee already on Resbite), 3 (an invitee not on Resbite) and 5 (folding);
- Constraints.

The open link's approval is Plan 3, and push delivery is Plan 4. Plan 1 (`docs/superpowers/plans/2026-10-27-phone-accounts.md`) is merged: phone accounts, test mode with 000000, `private.used_app`, `attest_age`, `formatPhone`, `samePhone`, `parsePhone`.

## Global Constraints

- **Branch** `contact-invites`, from `main`. Nothing in this plan touches the hosted project, the Supabase dashboard, Vercel, EAS or TestFlight. Task 13 writes the runbook.
- **SQL house pattern:**
  - `private` SECURITY DEFINER bodies with `set search_path = ''`, plus `public` SECURITY INVOKER façades;
  - functions anon must call are single SECURITY DEFINER functions in `public` (the GI1 `invitation_page` precedent);
  - explicit `revoke all … from public, anon, authenticated, service_role` before every grant;
  - errors `42501` (not allowed or no session), `22023` (invalid input) and `40001` (stale version).
- **The new migration** is `supabase/migrations/20261028120000_contact_invitations.sql`. It is hosted-compatible: it depends only on files in `supabase/tests/hosted-baseline/migrations.txt` plus `20261027120000_phone_accounts.sql`. Add that file to the hosted-baseline candidate list in tests and docs, not to `migrations.txt`.
- **Phone formats:** E.164 in the app (`+447700900834`); digits only in the database (`447700900834`, via `private.phone_digits`). Country calling codes are 1–3 digits.
- **Personal codes:** 22 characters of base64url (`^[A-Za-z0-9_-]{22}$`), from 16 random bytes made on the host's phone (`expo-crypto` `getRandomBytes(16)`). The database stores `extensions.digest(code,'sha256')`, never the code.
- **"On Resbite":** `private.user_eligible(id) and private.used_app(id)`, never the caller themself.
- **Host phone and region:** the host's region for parsing contacts is the country of their own verified phone (`libphonenumber-js` on `"+"+user.phone`), falling back to `deviceRegion()`.
- **Test mode:** 000000 never appears in any screen, page, hint or accessibility label, app or web.
- **Page CSP for `/i/`:** exactly the `/r/` CSP, except `connect-src https://<project-host>` (from `SUPABASE_URL`) and `script-src 'self'`. Nothing third-party.
- **Copy:** new app strings go in `mobile/src/domain/inviteCopy.ts`, and the web page's strings live in one module. Protected wording keeps its exact text. Headings are at most three words.
- **The app UI** uses the existing kit (`src/design/kit.tsx`, `ui.tsx`): VoiceOver labels and hints, Larger Text, no Reanimated layout animations.
- **Tests:** append every new `mobile/src/**/*.test.ts` to the `test` chain in `mobile/package.json`. New `links/*.test.mjs` files are appended the same way as the existing link tests.
- **Commands on this Linux box:**
  - SQL: `./scripts/test-database-docker.sh [--hosted-baseline supabase/migrations/20261027120000_phone_accounts.sql supabase/migrations/20261028120000_contact_invitations.sql]`
  - Worker and function tests: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`
  - Expo web for browser checks: `cd mobile && EXPO_PUBLIC_SUPABASE_URL=https://ewcsgvhuojxdpaspwsrx.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=qa-fixture-key npx expo start --web --port 8081`, with every `*.supabase.co` request intercepted. Never create `mobile/.env.local`.

## Review Focus

1. **A forwarded personal link:** someone else's verified number gets "That isn't the number <host> invited", no answer is recorded, and the database refuses `answer_phone_invitation` for a non-matching phone. Pinned in Task 2 (SQL) and Task 11 (web check).
2. **Local formats:** "07700 900834" typed on the web with the invitation's +44 matches `447700900834`, and so do "+44 7700 900834" and "0044 7700 900834". Pinned in Task 10 (`personal-flow.test.mjs`).
3. **Someone who becomes a Resbite user between lookup and invite** is invited in the app (`kind: "app"`) and gets no link. A number that belongs to the host themself is skipped. Pinned in Task 1 (SQL).
4. **A cancelled or started event, or a revoked invitation,** shows its closed state on the web, and an answer is refused. Pinned in Task 2 (SQL) and Task 10 (render).
5. **Inviting the same number twice** keeps one invitation and its answer. A new code replaces the old link's hash, so the old link stops working. Pinned in Task 1 (SQL).

---

### Task 1: Host-side invitations in the database

**Files:**
- Create: `supabase/migrations/20261028120000_contact_invitations.sql`. The header comment says it is hosted-compatible, names its rollback (Task 3), the spec and this plan.
- Create: `supabase/tests/contact-invitations.sql`, in the style of `supabase/tests/gi1.sql` and `phone-accounts.sql`: synthetic users with `phone` digits and `phone_confirmed_at`, roster or maintainer grants, `app_sessions` rows for "used the app", everything rolled back.
- Modify: `supabase/tests/hosted-baseline/tests.txt` (append `contact-invitations.sql`).

**Interfaces:**
- Consumes: `private.phone_digits`, `private.user_eligible`, `private.used_app`, `private.require_tester()`, `private.require_link_owner(p_plan)` (GI1), `public.attendees`, `private.notification_outbox`.
- Produces:
  - **Table `private.phone_invitations`:**
    - columns: `id uuid primary key default gen_random_uuid()`, `plan_id uuid not null references public.plans(id) on delete cascade`, `phone text not null check (phone ~ '^[1-9][0-9]{6,14}$')`, `country text not null check (country ~ '^[1-9][0-9]{0,2}$')`, `code_hash bytea unique`, `invited_by uuid not null`, `user_id uuid` (who answered), `answered_at timestamptz`, `created_at timestamptz not null default now()`, `revoked_at timestamptz`, `check_count int not null default 0`, `check_window timestamptz`;
    - unique index on `(plan_id, phone)`;
    - RLS on, no client grants.
  - **Table `private.lookup_usage`:** `(user_id uuid primary key, day date not null, count int not null)`, with RLS and no grants.
  - **Outbox:**
    - the `notification_outbox.kind` check adds `'invited'`;
    - the `detail` check allows a null detail for `'invited'`;
    - `private.beta_access.source` adds `'invitation'`, keeping `'link'` and `'maintainer'`.
  - **`public.contacts_on_resbite(p_phones text[]) returns text[]`** (house pattern, authenticated):
    - the caller must be eligible, else 42501;
    - at most 50 numbers per call, else 22023;
    - at most 500 numbers per caller per UTC day (`lookup_usage`), else 22023 "Try again tomorrow.";
    - returns the digits of the numbers whose holder is "On Resbite", excluding the caller.
  - **`public.invite_contacts(p_plan uuid, p_invites jsonb) returns jsonb`** (house pattern, authenticated):
    - `require_link_owner(p_plan)` (owner of an active, future plan);
    - `p_invites` is an array of at most 50 `{phone, country, code}`, else 22023;
    - each item returns `{phone: <digits>, kind}`, in input order:
      - `"self"`: the number is the caller's own;
      - `"already"`: the holder is already an attendee or the owner;
      - `"app"`: the holder is "On Resbite". Insert an attendee row (`pending`) and an outbox row `kind 'invited'`, recipient that user, `actor_id` the host, dedupe `'invited:'||plan||':'||user`;
      - `"link"`: anyone else. Upsert `phone_invitations` on `(plan_id, phone)`: set `country`, set `code_hash = digest(code)` (a malformed code is 22023), clear `revoked_at`, keep `user_id` and `answered_at`.
  - **`public.plan_phone_invitations(p_plan uuid) returns jsonb`** (house pattern, owner only, 42501 otherwise): `[{phone, country, answered: bool, response: text|null}]` for rows with `revoked_at is null`. `response` comes from the attendee row of `user_id`.
  - **`public.revoke_phone_invitation(p_plan uuid, p_phone text) returns void`** (house pattern, `require_link_owner`):
    - sets `revoked_at` and `code_hash = null`;
    - if `user_id` is set, deletes that attendee row.
  - **`private.remove_guest(p_plan,p_user)` redefined** from GI1's body. It also sets `revoked_at`/`code_hash = null` on `phone_invitations` where `user_id = p_user` and `plan_id = p_plan`. Grants unchanged.

- [ ] **Step 1: Write failing SQL tests in `contact-invitations.sql`:**
  - **lookup:**
    - an eligible caller gets back `['447700900201']` for `['+44 7700 900201','447700900202','447700900203']`, where 201 is eligible and used the app, 202 is eligible but never used it, and 203 doesn't exist;
    - the caller's own number is not returned;
    - 51 numbers → 22023;
    - a non-eligible caller → 42501;
    - the 501st number in a day → 22023.
  - **invite:**
    - with the items 201 (On Resbite), 202 (code A), the host's own number and an existing attendee's number, the kinds are `["app","link","self","already"]`;
    - an attendee row `pending` exists for 201's user, plus one outbox row `kind='invited'`;
    - `phone_invitations` has 202 with `code_hash = digest(A)`;
    - inviting 202 again with code B keeps one row, `code_hash = digest(B)`, and any `user_id`/`answered_at` untouched;
    - a non-owner → 42501, a cancelled plan → 42501, a malformed code → 22023, 51 items → 22023.
  - **list and revoke:**
    - `plan_phone_invitations` lists 202 with `answered=false`;
    - after `revoke_phone_invitation(plan,'447700900202')` the list is empty and `code_hash` is null;
    - a non-owner → 42501.
  - **remove_guest:** a guest attached to a `phone_invitations` row gets that row revoked as well.
  - **grants:** anon cannot execute any of the four public functions (42501).
- [ ] **Step 2: Run** `./scripts/test-database-docker.sh`. Expected: FAIL in `contact-invitations.sql`.
- [ ] **Step 3: Implement the Produces list.** Lookups compare `private.phone_digits(input)` with `auth.users.phone`, which requires `phone_confirmed_at is not null`.
- [ ] **Step 4: Run** both harness modes (Global Constraints). Expected: `PASS: contact-invitations.sql` in both.
- [ ] **Step 5: Commit** "Invite contacts by number: look up who is on Resbite, invite in the app or by a personal link".

### Task 2: Invitee-side invitations in the database

**Files:**
- Modify: `supabase/migrations/20261028120000_contact_invitations.sql` (append), `supabase/tests/contact-invitations.sql` (append).

**Interfaces:**
- Consumes: Task 1's table; `private.age_attestations`; `public.profiles`; `private.beta_access`; `private.require_tester`'s lock seed (47); `respond`'s outbox `rsvp` pattern (`20261014120000_ux2_rules.sql:22-40`).
- Produces:
  - **`public.personal_invitation_page(p_code text) returns jsonb`** (single SECURITY DEFINER in `public`; anon and authenticated):
    - a malformed, unknown or revoked code, or an ownerless plan → `{state:'inactive'}`;
    - a cancelled or started event → `{state:'cancelled'|'happened', host, title}`;
    - otherwise `{state:'open', host, title, starts_at, ends_at, time_zone, area, going, image:{kind,ref}, ending: <last two digits>, country: <calling code>}`. The image comes from `invitation_page`'s rules, and `going` counts `accepted`.
    - It never returns the full number, the place, meeting details or guests' names.
  - **`public.check_invited_number(p_code text, p_phone text) returns boolean`** (single definer in `public`; anon and authenticated):
    - false for an inactive or closed invitation;
    - otherwise true when `phone_digits(p_phone) = phone`;
    - limited to 10 checks per invitation per hour (`check_count`/`check_window`); over the limit it raises 22023 "Too many tries. Try again later."
  - **`public.answer_phone_invitation(p_code text, p_name text, p_response text, p_terms_version text) returns jsonb`** (house pattern, authenticated; the Auth session comes from the web's OTP sign-in):
    1. Take the caller's per-user advisory lock (seed 47).
    2. The caller's `auth.users.phone` must be confirmed and equal the invitation's `phone`, else 42501 "That isn't the invited number."
    3. The invitation must be live (not revoked, plan active and future, the caller not the owner), else 42501 "Invitation unavailable".
    4. If `user_id` is set and differs from the caller, 42501.
    5. A revoked `beta_access` grant (a ban) → 42501.
    6. `p_response` is in (`accepted`,`maybe`,`declined`), else 22023.
    7. Without a stored attestation, `p_terms_version` must match `^[0-9]{4}-[0-9]{2}$` and is stored; else 22023.
    8. Without a profile, `p_name` (trimmed, 1–80 characters) creates it; else 22023.
    9. Grant `beta_access(source 'invitation')` if there is none.
    10. Upsert the attendee: a new row with the response; an existing row has its response set and `version` bumped.
    11. Set `user_id` and `answered_at`.
    12. Queue outbox `rsvp` to the owner, as `respond` does.

    Returns `{response, plan_id}`.
  - **`public.my_phone_invitation(p_code text) returns jsonb`** (house pattern, authenticated): `personal_invitation_page(p_code)` plus `response` when the caller is attached (`user_id = auth.uid()`). Otherwise `response: null`.

- [ ] **Step 1: Write failing SQL tests:**
  - **page:**
    - an open invitation gives `ending` `'02'`, `country` `'44'`, no `place_label`, and `going` counting only `accepted`;
    - unknown, revoked, cancelled and started invitations give `inactive`, `inactive`, `cancelled` and `happened`.
  - **check:** `('code A','07700 900202')` is false; `('code A','+447700900202')` is true; the 11th call within the hour raises 22023.
  - **answer:**
    - a user with confirmed phone 202 answers `accepted`, name `'Sam'`, terms `'2026-10'`. This creates the attestation, `beta_access source='invitation'`, a profile `'Sam'`, an attendee `accepted`, `user_id` and one `rsvp` outbox row, and `private.user_eligible` becomes true;
    - answering again with `declined` updates the response and bumps the version;
    - a different confirmed phone → 42501 (Review Focus 1);
    - an unconfirmed phone → 42501;
    - a revoked or cancelled invitation → 42501;
    - a banned grant → 42501;
    - `'nope'` → 22023;
    - no profile and an empty name → 22023.
  - **my_phone_invitation:** an attached caller gets `response='declined'`; another caller gets null.
- [ ] **Step 2: Run** the full harness. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both harness modes. Expected: PASS.
- [ ] **Step 5: Commit** "Let a verified invitee read, check and answer their personal invitation".

### Task 3: Folding a web-only account, the rollback and the hosted rehearsal

**Files:**
- Modify: `supabase/migrations/20261028120000_contact_invitations.sql` (append), `supabase/tests/contact-invitations.sql` (append).
- Create: `supabase/rollback/20261028120000_contact_invitations.rollback.sql`, plus `supabase/tests/hosted-baseline/20261028120000_contact_invitations.before.sql` and `.after.sql`, modelled on `20261027120000_phone_accounts.before.sql`/`.after.sql`. They fingerprint the redefined functions and constraints, check the new objects and grants, and rehearse the rollback.

**Interfaces:**
- Produces **`private.fold_web_account(p_from uuid, p_into uuid) returns jsonb`**, plus a `public.fold_web_account(p_from uuid, p_into uuid)` façade so the Edge Function can call it through REST. *Amended during Task 3 (ruling R5): the public function is a single SECURITY DEFINER function with `search_path = ''`, executable only by `service_role`, with no schema grant. `service_role` has no usage on `private`, so an invoker façade could not reach the body.* Both are executable by `service_role` only:
  - Refuses (22023) when:
    - the ids are equal;
    - `p_from` has an `app_sessions` row;
    - `p_from` owns any plan;
    - `p_into` doesn't exist.
  - Under both users' advisory locks, ordered by uuid, it:
    1. moves `p_from`'s attendee rows to `p_into`. Where `p_into` is already an attendee of that plan, `p_into`'s row is kept and `p_from`'s deleted;
    2. moves `phone_invitations.user_id`;
    3. moves `age_attestations` and `beta_access` when `p_into` has none (a revoked grant on either side keeps the revocation);
    4. deletes `p_from`'s profile.
  - Returns `{moved_attendees: n}`.
  - Idempotent: a missing `p_from` returns `{moved_attendees: 0}`.
- The rollback:
  - drops everything Tasks 1–3 created;
  - restores GI1's `remove_guest` body verbatim;
  - restores both checks. It first deletes `'invited'` outbox rows and `'invitation'` grants (whose holders lose access), and says so in its header.

- [ ] **Step 1: Write failing SQL tests:**
  - a fold moves a web-only user's two attendee rows (one overlapping) and its attestation and grant into an email account, and deletes the profile;
  - folding a user who used the app → 22023;
  - a second call returns `{moved_attendees: 0}`;
  - `authenticated` cannot execute it.
- [ ] **Step 2: Run, then implement the function and the rollback, then run both harness modes.** In hosted-baseline mode, pass both candidates in order.

  Expected: `PASS: 20261028120000_contact_invitations applies on the hosted baseline`, its after-checks pass, and `PASS: contact-invitations.sql (hosted baseline)`.
- [ ] **Step 3: Commit** "Fold a web-only account into the account that adds its number; add the rollback and its rehearsal".

### Task 4: The folding Edge Function

**Files:**
- Create: `supabase/functions/_shared/phone-fold.ts`, its test `phone-fold.test.ts`, and `supabase/functions/fold-phone-account/index.ts` plus a `README.md`. Model them on `delete-account/index.ts` and `_shared/account-deletion*.ts`, with injected deps and a hard gate.
- Modify: `supabase/functions/_shared/deletion-release.ts`, or a new `_shared/fold-release.ts`, adding `export const PHONE_FOLD_RELEASE_APPROVED = false;`.

**Interfaces:**
- Produces `handleFold(request: Request, deps: FoldDeps): Promise<Response>`, where:
  - `FoldDeps` = `{ approved: boolean; userFor(token: string): Promise<{id: string; phone: string|null; phone_confirmed_at: string|null} | null>; fold(from: string, into: string): Promise<void>; deleteUser(id: string): Promise<void>; setPhone(id: string, digits: string): Promise<void> }`;
  - the body is `{ foreign_token: string, phone: string }`, and the caller's JWT comes in `Authorization`.

  Order:
  1. Not `approved` → 503, with zero calls.
  2. A missing or invalid caller or foreign token → 401.
  3. The foreign user's phone must be confirmed and equal the digits of `phone`, else 403.
  4. The same user on both sides → 409.
  5. The caller already has a confirmed phone → 409.
  6. `fold(from, into)`, which calls `POST /rest/v1/rpc/fold_web_account` with the service-role key.
  7. `deleteUser(from)`, via the admin API.
  8. `setPhone(into, digits)`, via the admin API with `phone_confirm: true`.
  9. 200 `{ok: true}`.

  A failure after step 6 returns 500, and a retry is safe: the fold is idempotent, and a deleted user is treated as absent.
- `index.ts` wires the deps to `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (the platform-provided env), as `delete-account` does.

- [ ] **Step 1: Write failing tests:**
  - not approved → 503 and no calls;
  - bad tokens → 401;
  - a phone mismatch → 403;
  - the same user → 409;
  - a caller who already has a phone → 409;
  - the happy path calls fold → deleteUser → setPhone in that order;
  - `deleteUser` throwing → 500, and a retry completes.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the worker tests. Expected: `# fail 0`.
- [ ] **Step 4: Commit** "Add the switched-off function that folds a web-only account into the caller".

### Task 5: Contact invitation rules in the app

**Files:**
- Create: `mobile/src/domain/contactInvites.ts` and its test `contactInvites.test.ts`; `mobile/src/domain/inviteCopy.ts`.
- Modify: `mobile/package.json` (the test chain).

**Interfaces:**
- Consumes: `parsePhone`, `formatPhone`, `deviceRegion` (`src/domain/phone.ts`), `libphonenumber-js/min`.
- Produces:
  - `type ContactNumber = { key: string /* e164 */; name: string; e164: string; country: string /* calling code */; label: string /* formatted */ }`
  - `contactNumbers(rows: {fullName?: string|null; phones: {number: string}[]}[], region: string): { numbers: ContactNumber[]; skipped: number }`. One entry per distinct E.164. A contact with several numbers yields several entries, all named after the contact. Unparseable numbers count as `skipped`. The result is sorted by name.
  - `hostRegion(userPhone: string | null | undefined, fallback: string): string`. The region of `"+"+digits`, else `fallback`.
  - `newInviteCode(bytes: Uint8Array): string`. base64url, no padding, 22 characters.
  - `personalLink(origin: string, code: string): string`, giving `<origin>/i/<code>`.
  - `inviteMessage(a: { host: string; title: string; when: string; link: string }): string`, giving `"<host> invited you to <title>, <when>. Reply here: <link>"`.
  - `whatsappUrl(e164: string, text: string): string`, giving `https://wa.me/<digits>?text=<encodeURIComponent(text)>`.
  - `smsUrl(e164: string, text: string): string`, giving `sms:<e164>&body=<encoded>`. That is the iOS form; others use `?body=`, picked by a `platform` argument defaulting to `"ios"`.
  - `INVITE_COPY`:
    - `heading: "Invite people"`, `search: "Search contacts"`, `onResbite: "On Resbite"`, `invite: (n) => \`Invite ${n}\``
    - `lookupNote: "Resbite checks only the numbers you pick."`
    - `almostHeading: "Almost there"`, `invitedInApp: (names) => \`${names} ${…} invited. They’ll see it in Resbite.\``
    - `notYet: "Not on Resbite yet"`, `whatsapp: "WhatsApp"`, `messages: "Messages"`
    - `sentWhatsapp: "Sent on WhatsApp"`, `sentMessages: "Sent on Messages"`
    - `linkNote: "Each link only works for that person’s number."`, `done: "Done"`
    - `addNumber: "Add a number"`, `chooseNumber: "Which number?"`, `skipped: (n) => \`${n} skipped\``
    - `invitedGroup: "Invited"`, `resend: "Send again"`, `removeInvite: (name) => \`Remove the invitation for ${name}?\``
    - `invitationsHeading: "Invitations"`, `invitedYou: (host) => \`${host} invited you\``

    Write natural English joining for `invitedInApp`: "Ana is" / "Ana and Leo are" / "Ana, Leo and Mia are".

- [ ] **Step 1: Write failing tests:**
  - `contactNumbers` with Sam (two numbers), a duplicate of one of Sam's numbers under "Samuel", an empty name, and "12": distinct E.164s, Sam's two entries, and `skipped: 1`;
  - `"07700 900834"` with region GB gives `+447700900834`, country `"44"`;
  - `hostRegion("447700900834","AR")` gives `"GB"`; `hostRegion(null,"AR")` gives `"AR"`;
  - `newInviteCode` of 16 bytes matches `^[A-Za-z0-9_-]{22}$`;
  - `whatsappUrl("+447700900834","a b")` = `"https://wa.me/447700900834?text=a%20b"`;
  - `smsUrl("+447700900834","a b")` = `"sms:+447700900834&body=a%20b"`, and with `"android"` it is `"sms:+447700900834?body=a%20b"`;
  - `inviteMessage` gives the exact sentence;
  - `invitedInApp` joins one, two and three names.
- [ ] **Step 2: Run, implement, then run the test and `npm run check`.**
- [ ] **Step 3: Commit** "Turn contacts into invitable numbers and build personal links and messages".

### Task 6: Contact invitation services and the host's code store

**Files:**
- Create: `mobile/src/services/contactInvites.ts` (gateway) with its test, and `mobile/src/services/inviteCodeStore.ts` with its test.
- Modify:
  - `mobile/src/services/sessionLifecycle.ts`, or wherever sign-out clears device data (follow how `peopleStore` and `recentPlaces` are cleared), so the code store is cleared at sign-out and deletion;
  - `mobile/package.json`.

**Interfaces:**
- Produces, in `contactInvites.ts`:
  - `type InviteKind = "app" | "link" | "self" | "already"`
  - `type PhoneInvitation = { phone: string /* digits */; country: string; answered: boolean; response: string | null }`
  - `type ContactInviteGateway = { onResbite(phones: string[]): Promise<Set<string /* digits */>>; invite(plan: string, items: { phone: string; country: string; code: string }[]): Promise<{ phone: string; kind: InviteKind }[]>; list(plan: string): Promise<PhoneInvitation[]>; revoke(plan: string, phone: string): Promise<void> }`
  - `contactInviteGateway`. It calls the RPCs `contacts_on_resbite(p_phones)`, `invite_contacts(p_plan,p_invites)`, `plan_phone_invitations(p_plan)` and `revoke_phone_invitation(p_plan,p_phone)` through `withDeadline` (`services/plans.ts`). The lookup batches 50 numbers at a time.
  - `inviteErrorMessage(e: unknown): string`. 42501 maps to "Only the organizer can invite people to an upcoming resbite." and 22023 passes the server message through. The connection copy is "Check your connection and try again."
- Produces, in `inviteCodeStore.ts`:
  - `type StoredInvite = { code: string; name: string; sentVia?: "whatsapp" | "messages" }`
  - `createInviteCodeStore(storage)` with `get(scope, plan): Promise<Record<string /* e164 */, StoredInvite>>`, `put(scope, plan, e164, value): Promise<void>`, `remove(scope, plan, e164): Promise<void>` and `clear(scope): Promise<void>`. It uses the chunked secure storage that `peopleStore` uses, under key `resbite.invite-codes.v1.<scope>`.
  - `inviteCodeStore`, the default instance.

- [ ] **Step 1: Write failing tests:**
  - the lookup batches 120 numbers into 3 calls and unions the results;
  - `invite` maps the RPC's reply in input order;
  - the error mapping;
  - the store round-trips per scope and plan, `remove` drops one entry, and `clear` wipes the scope.
- [ ] **Step 2: Implement, wire the sign-out clear, and run `npm run check`.**
- [ ] **Step 3: Commit** "Call the contact invitation RPCs and keep personal codes on the host's phone".

### Task 7: Invite people from contacts

**Files:**
- Rewrite: `mobile/app/invitations.tsx`. The route and its entry points (`arrange.tsx` `invite()`, `event.tsx` "Invite someone") stay.
- Create: `mobile/src/state/useContactInvites.ts` and `mobile/src/design/ContactPicker.tsx`.

**Interfaces:**
- Consumes: Tasks 5–6; `createContactService`/`readContactPage`/`expandContactAccess` (`services/contacts.ts`) and the limited-access and Settings patterns in `app/people.tsx`; `planGateway.read`; `readProfile`; `invitationGateway` (GI1 link: Share, Copy, Turn off); `expo-crypto`; `Linking`; `AppState`.
- Produces two steps, following the mockup `docs/superpowers/specs/mockups/2026-10-27-contact-invitations/host-side.html`, screens 1 and 2.
  - **Pick:**
    - heading `INVITE_COPY.heading`, a search field, a strip of selected chips;
    - a list of `ContactNumber`s, loaded 50 contacts at a time with "Load more", the limited-access chip and "Allow more contacts", and a Settings button when denied;
    - the `onResbite` badge from `onResbite()`, which runs for the selected numbers only, debounced 400 ms;
    - a manual "Add a number" row, parsed with `hostRegion`;
    - `lookupNote` under the primary button, `invite(n)`, disabled at 0.
  - **Almost there:**
    1. Make a code for every selected number without a stored code; reuse a stored one.
    2. Call `invite(plan, items)`.
    3. Store codes and names for `kind: "link"`, and drop stored codes for `app`, `self` and `already`.
    4. Show the in-app sentence for `app`; skip `self`; show "Already invited" for `already`.
    5. List the `link` people with WhatsApp and Messages buttons. They call `Linking.openURL(whatsappUrl|smsUrl(e164, inviteMessage({host, title, when, link: personalLink(EXPO_PUBLIC_INVITATION_ORIGIN, code)})))`. On success, store `sentVia` and show the sent chip. A failure to open WhatsApp shows "WhatsApp isn’t installed. Try Messages."
    6. `linkNote`, and `done` → `router.back()`.
  - **Event link:** an "Event link" section at the bottom of Pick keeps GI1's Share, Copy and Turn off unchanged until Plan 3.
  - A missing `EXPO_PUBLIC_INVITATION_ORIGIN` falls back to `https://link.resbite.com`.

- [ ] **Step 1: Build the hook (selection, lookup debounce, invite, send state) and the screen.** Run `npm run check`.
- [ ] **Step 2: Smoke-load** `/invitations?plan=<id>` in Expo web with intercepted fixtures, with no page errors.
- [ ] **Step 3: Commit** "Invite people from contacts: badges, in-app invites and personal links sent from your phone".

### Task 8: Invited people on the event page; invitations in My resbites

**Files:**
- Modify:
  - `mobile/app/event.tsx`, the guest sheet: an "Invited" group (organizer only) listing `plan_phone_invitations` with `answered=false`. Each row shows the stored name or `formatPhone`, and offers "Send again" (the composer of its `sentVia`, else WhatsApp) and Remove (`revoke`, then drop the stored code).
  - `mobile/src/state/useEvent.ts`: load the phone invitations for the owner.
  - `mobile/app/(tabs)/plans.tsx`: an Invitations section above the segments, for plans where the caller is an invitee with `response === "pending"` and the plan is upcoming. Each card has `invitedYou(host)` and an inline `Segmented` Going / Maybe / Can't go that answers through the existing RSVP services (`services/rsvp.ts`, `readRsvp`/`reconcileRsvp`/`writeRsvp`), then refreshes. The attendees select adds `version`.
  - `mobile/src/domain/eventView.ts`: a pure `invitationCards(plans, attendees, uid, now)`, with tests in `eventView.test.ts`.
- Modify: `mobile/app/data-privacy.tsx` (the contacts topic). Add the sentence: "When you invite people, Resbite checks only the numbers you pick to see who already uses it. Your address book never leaves your phone." Keep all existing wording.

**Interfaces:**
- Consumes: Tasks 5–6; the rsvp services; `guestGroups`.
- Produces `invitationCards(plans: Plan[], attendees: {plan_id: string; user_id: string; response: string}[], uid: string, now: number): Plan[]`. These are upcoming active plans where `uid` is an attendee with `response === "pending"` and not the owner, sorted by `starts_at`.

- [ ] **Step 1: Write a failing `invitationCards` test** covering pending upcoming, answered, the owner's own plan, a past plan and a cancelled plan.
- [ ] **Step 2: Implement it all.** Run `npm run check`.
- [ ] **Step 3: Commit** "Show invited people to the host and new invitations at the top of My resbites".

### Task 9: Bring a web-only account into this one at Add your number

**Files:**
- Modify: `mobile/src/state/usePhoneVerification.ts` (`add` purpose), `mobile/app/add-phone.tsx`, `mobile/src/domain/phoneCopy.ts`.
- Create: `mobile/src/services/phoneFold.ts` with its test.

**Interfaces:**
- Consumes:
  - the isolated auth client pattern in `src/services/accountDeletion.ts` (`isolatedAuth()`), so the app's own session never changes;
  - `phoneCodeDeps`' 000000 exchange (`exchange_test_code`);
  - the Edge Function `fold-phone-account` (Task 4).
- Produces:
  - `foldPhoneAccount(d: FoldClientDeps, e164: string, token: string, sentAt: number): Promise<{ ok: true } | { ok: false; message: string; clear: boolean }>`:
    - verifies the code with the isolated client (`verifyOtp({phone, token, type:"sms"})`, exchanging 000000 first as `verifyPhoneCode` does);
    - posts `{foreign_token, phone}` to `/functions/v1/fold-phone-account` with the app session's bearer token;
    - 503 maps to `PHONE_COPY.foldOff = "Bringing an invitation into this account isn’t switched on yet."`;
    - 403/409 map to `PHONE_COPY.taken`.
  - `sendFoldCode(d, e164)`: isolated `signInWithOtp({phone, options:{shouldCreateUser:false}})`.
  - When `reason === "taken"`, Add your number shows `PHONE_COPY.foldOffer = "This number answered an invitation on the web. Confirm it with a code to bring its resbites here."` with a "Send code" action. On success it refreshes the account and goes to `/account`. If the number belongs to an account that has used the app, the function refuses, and the taken copy stays.

- [ ] **Step 1: Write failing tests:**
  - the 000000 swap goes to the isolated client;
  - the function call carries both tokens;
  - 503, 403 and connection failures map to their copy;
  - the app session is never touched (there's no call on the main client's auth).
- [ ] **Step 2: Implement.** Run `npm run check`.
- [ ] **Step 3: Commit** "Offer to bring a web-only invitation account into this one at Add your number".

### Task 10: The personal invitation page on the link site (server)

**Files:**
- Create: `links/server/api/personal.mjs` and `links/server/lib/personal.mjs` (render).
- Modify: `links/server/lib/supabase.mjs` (`readPersonalInvitation(code, fetchImpl)` calls `personal_invitation_page`), `links/generate.mjs`, `links/generate.test.mjs`, `links/page.test.mjs`. If they're clearer separate, create `links/personal.test.mjs` and add it to the `mobile/package.json` test chain next to the others.

**Interfaces:**
- Produces:
  - **`renderPersonalPage(data, options)`.** `options` = `{ origin, code, appStoreUrl, supabaseUrl, publishableKey, termsVersion, termsUrl, privacyUrl }`. States are `open`, `cancelled`, `happened` and `inactive`, as on `/r/`.
    - `open` renders screen 1 of `docs/superpowers/specs/mockups/2026-10-27-contact-invitations/invitee-web-journey.html`: "<host> invited you", the image (`/r/`'s image rules: `/i/<code>/image`), title, time range, area, the going line, and "This invitation is for the number ending ••<ending>." with an Answer button.
    - Hidden step containers for Confirm, Code, Answer and Get the app are filled by the client script.
    - A `<script type="module" src="/personal.js">`, plus `data-` attributes on `<main>` carrying `supabaseUrl`, `publishableKey`, `code`, `country`, `ending`, `host`, `termsVersion` and `appStoreUrl`.
    - The preview meta matches `/r/`'s: never the place or the number.
  - **`personalHeaders(supabaseUrl)`:** the `/r/` headers with `connect-src https://<host of supabaseUrl>`.
  - **`/i/:code` → `api/personal?code=:code`**, and `/i/:code/image` → `api/image?kind=personal&code=:code`. Extend `image.mjs` to read `personal_invitation_page` for `kind=personal`.
  - **Generated files:** `vercel.json` gains the rewrites, plus `personal.js` and `personal-flow.mjs` among the copied assets (Task 11 writes them; for now create stubs). The AASA file is unchanged: `/i/` stays web-only.
  - **Env:** `EXPO_PUBLIC`-style values are not used here. The page reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (already set on Vercel), `TERMS_URL`/`PRIVACY_URL` (optional; plain words when unset) and `TERMS_VERSION`, with the default `"2026-10"` matching `mobile/src/domain/guestAccount.ts`.

- [ ] **Step 1: Write failing tests:**
  - every state's render;
  - escaping;
  - the preview has no area, place or number;
  - the ending is shown;
  - the `data-` attributes are present and the publishable key appears only there;
  - the CSP has exactly one `connect-src` host;
  - the handler with a fake reader, including an error → `inactive`;
  - `generate` writes the rewrites and assets, and the AASA file still lists only `/invite` and `/r/*`.
- [ ] **Step 2: Implement.** Run `cd mobile && npm run check`.
- [ ] **Step 3: Commit** "Render personal invitation pages on link.resbite.com".

### Task 11: The personal invitation page (client steps and get the app)

**Files:**
- Create:
  - `links/assets/personal-flow.mjs`: pure logic, with no DOM or fetch at import;
  - `links/assets/personal.js`: DOM and fetch;
  - `links/assets/personal.css`;
  - `links/personal-flow.test.mjs`: node tests, added to the test chain;
  - `links/verify-personal.mjs`: a Playwright check against a local static server built from `generate()` output plus a tiny local handler for `/i/<code>`, with every `*.supabase.co` request intercepted. Run it with `node --import tsx ../links/verify-personal.mjs` from `mobile/`.

**Interfaces:**
- Produces, in `personal-flow.mjs`:
  - `composeNumber(input: string, country: string): string | null`:
    - `+…` is used as is;
    - `00…` becomes `+…`;
    - otherwise it is `"+"+country+` the digits with leading zeros removed;
    - null when there are fewer than 7 digits.
  - `PAGE_COPY` with the mockup strings:
    - `answer: "Answer"`, `notYou: (host) => \`Not your number? Ask ${host} to check it.\``
    - `confirmHeading: "Confirm it’s you"`, `confirmBody: (host) => \`Type the number ${host} invited. We’ll text it a code.\``
    - `numberField: "Mobile number"`, `send: "Send code"`, `wrongNumber: (host) => \`That isn’t the number ${host} invited.\``
    - `codeField: "6-digit code"`, `verify: "Verify"`, `mismatch: "That code doesn’t match. Try again."`, `resendIn` (as in the app)
    - `verified: (ending) => \`✓ Verified · ••${ending}\``, `nameField: "Your first name"`
    - `going: "Going"`, `maybe: "Maybe"`, `cantGo: "Can’t go"`, `sendAnswer: "Send answer"`, `hostSees: (host) => \`${host} will see your answer.\``
    - `goingHeading: "You’re going!"`, `maybeHeading: "You might come"`, `cantHeading: "Thanks for letting them know"`
    - the benefits list: "Hear when the time or place changes", "See who else is going", "Get the exact address and meeting details", "Reminders before it starts", "Add it to your calendar"
    - `getApp: "Get Resbite"`, `waiting: (formatted) => \`Sign up with ${formatted} and this resbite will be waiting.\``, `notNow: "Not now"`, `planOwn: "Plan your own with Resbite."`
    - the tick and terms copy, the same as the app's GI2 copy
  - A step reducer: `next(state, event)` over `"invite" → "confirm" → "code" → "answer" → "done"`, with errors held in state.
- `personal.js`, in order:
  1. On load, if `localStorage` holds a session for this origin, refresh it if needed (`POST /auth/v1/token?grant_type=refresh_token`) and call `my_phone_invitation`. With a response, show "done" with the answer and allow changing it (Review Focus: coming back on the same browser).
  2. Confirm requires the tick. It composes the number, calls `check_invited_number`; false shows `wrongNumber` and sends nothing.
  3. Otherwise `POST /auth/v1/otp {phone, create_user:true}`.
  4. Code: if `000000`, first `exchange_test_code`; then `POST /auth/v1/verify {type:"sms", phone, token}`. Store the session.
  5. Answer: `answer_phone_invitation` with the name, the response and `termsVersion`.
  6. Done: direction A for Going/Maybe (the benefits list, `getApp` → `appStoreUrl`, `waiting` with `+<country> ••• <last three>` built from the confirmed number, Not now). The softer version for Can't go (`cantHeading`, `hostSees`, a smaller Get Resbite link, `planOwn`).

  All requests carry `apikey` and, once signed in, `Authorization: Bearer`. A connection error shows "Check your connection and try again." Focus moves to each step's heading.

- [ ] **Step 1: Write failing `personal-flow.test.mjs` tests:**
  - `composeNumber`: `("07700 900834","44")` gives `+447700900834`, `("+44 7700 900834","44")` the same, `("0044 7700 900834","44")` the same (Review Focus 2), and `("12","44")` gives null;
  - the reducer's happy path and its errors;
  - the copy has no `000000`.
- [ ] **Step 2: Write `verify-personal.mjs` cases:**
  1. open → Answer → the tick is required → a wrong number shows `wrongNumber` and sends no `/otp` → the right number sends `/otp` → `000000` sends the exchange, then `/verify` with the stored code → the name and Going send `answer_phone_invitation` with exactly `{p_code,p_name:"Sam",p_response:"accepted",p_terms_version:"2026-10"}` → the done screen shows the benefits and Get Resbite's href is the app store URL;
  2. a reload shows the answer again (the stored session) and allows changing it to Can't go, which shows the softer screen;
  3. the `cancelled` and `inactive` pages render without the form;
  4. the page never shows `000000`, and no request goes to any host other than the page origin and the intercepted Supabase host.
- [ ] **Step 3: Implement. Run the node tests, `verify-personal.mjs` and `npm run check`.**
- [ ] **Step 4: Commit** "Let invitees confirm their number, answer on the web and get the app".

### Task 12: Browser checks and captures in the app

**Files:**
- Create: `mobile/scripts/verify-contact-invites.mjs`, in the style of `verify-phone.mjs`, with every request intercepted and the contacts adapter faked as the existing people script does.
- Modify: `mobile/scripts/verify-invitations.mjs` (GI1's link section is now at the bottom of Invite people), `verify-event.mjs` (the Invited group), `review-ui.mjs` (Invite people Pick and Almost there, the Invitations section, and the Add your number fold offer, at 390/320 and Larger Text 320).

- [ ] **Step 1: Write the cases:**
  1. Pick three contacts. The lookup request carries only those numbers' digits, and one shows On Resbite.
  2. Invite 3 sends `invite_contacts` with three items, each with a 22-character code. A reply of `app`, `link`, `link` shows the in-app sentence for one and two people with WhatsApp and Messages.
  3. WhatsApp opens `https://wa.me/<digits>?text=` with the personal link `…/i/<code>` (`Linking.openURL` stubbed on web) and shows "Sent on WhatsApp".
  4. Invite people again for the same number reuses the stored code.
  5. The event page's Invited group shows the two, and Remove calls `revoke_phone_invitation`.
  6. My resbites shows an Invitations card for a pending invitation, and Going on the card sends `respond` and moves it to Upcoming.
  7. Add your number with a taken number shows the fold offer, and the fold call posts to `/functions/v1/fold-phone-account` with both tokens.
  8. No `000000` and no full phone number of another person appear anywhere they shouldn't. The host may see their own contacts' numbers.
- [ ] **Step 2: Run** every `node scripts/verify-*.mjs`, `node scripts/review-ui.mjs`, `node --import tsx ../links/verify-personal.mjs`, then `npx expo export --platform ios --output-dir dist-ios`, removing `dist-ios` afterwards. Expected: all exit 0.
- [ ] **Step 3: Commit** "Check contact invitations, the Invited group, Invitations and the fold offer in the browser".

### Task 13: Records and rollout runbook

**Files:**
- Create: `qa/contact-invites-2026-10-28/README.md`.
- Modify: `docs/implementation-status.md`, `knowledge-base/08-decisions.md` (this plan's calls), `supabase/README.md` (the new functions), `supabase/functions/fold-phone-account/README.md`.

- [ ] **Step 1: Write the runbook.** None of these steps is run in this task.
  1. **Migration:** owner approval by name and sha256, applied straight after `20261027120000_phone_accounts.sql`, with before/after snapshots and advisors.
  2. **Fold function:** `supabase functions deploy fold-phone-account` with the release constant flipped in a reviewed commit and owner approval. Until then the app shows `foldOff`.
  3. **Link site:**
     - regenerate and deploy `links/`;
     - set `TERMS_URL`, `PRIVACY_URL` and `APP_STORE_URL` (the TestFlight invite);
     - add a Vercel firewall rate limit on `/i/*` next to `/r/*`.
  4. **App build:** `EXPO_PUBLIC_INVITATION_ORIGIN=https://link.resbite.com` in the EAS production environment.
  5. **iPhone checks:**
     - invite two contacts, one of them a coworker with the app;
     - send by WhatsApp and by Messages;
     - the web flow on a phone without Resbite (test mode);
     - sign into the app with that number;
     - an existing account adding a number that answered on the web, then folding it.
  6. **Known limits:**
     - Argentine mobile numbers typed in national format may not compose correctly on the web (they need the international form);
     - `/i/` doesn't open the app;
     - a host's codes live on their phone, so another phone sends a new code, and the old link stops working.
  7. **Rollback:** serve the previous build, run the rollback SQL with approval (it removes the grants made by invitations), and redeploy the previous link site.
- [ ] **Step 2: Update the documents.** Run every check one last time.
- [ ] **Step 3: Commit** "Record contact invitations: decisions, status and the rollout runbook".
