# Phone Accounts (Contact Invitations, Plan 1 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Resbite account gets a verified phone number. New people sign up with their number and a code, then fill in their name, by hand or with Apple or Google. Existing accounts are asked to add their number once. A server-side test mode accepts 000000 for any number until SMS is paid for.

**Architecture:**
- **Codes:** Supabase phone sign-in stays the real path. Supabase's Send SMS hook is a Postgres function: in test mode it stores the code it would have texted. `exchange_test_code` swaps 000000 for that stored code, so the app calls Supabase's ordinary `verifyOtp`.
- **Database:** confirmation and eligibility checks accept a confirmed phone as well as a confirmed email.
- **App:** gains `/auth/phone` (number, then code), `/about-you` (name; Apple or Google fill it in by linking) and `/add-phone` (the "Add your phone number" gate). `app/account.tsx` routes to them through one tested function.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, expo-router, supabase-js 2.116, Postgres (Supabase), `libphonenumber-js` (new), Playwright browser scripts, Docker `postgres:17` for the SQL harness on Linux.

**Spec:** `docs/superpowers/specs/2026-10-27-contact-invitations-design.md` (decisions CI-D7, CI-D8, CI-D10, CI-D13 and CI-P2, CI-P8 to CI-P12; flows 4 and 5; Test mode). Plans 2 (contact invitations and the web flow), 3 (open-link approval) and 4 (push) follow, each written after the previous one lands.

## Global Constraints

- Read the exact versioned Expo docs (https://docs.expo.dev/versions/v57.0.0/) before writing app code (`mobile/AGENTS.md`).
- **Branch:** `contact-invitations`, from `main` (which includes UX3, GI1 and GI2).
- **Nothing in this plan touches the hosted project.** Applying the migration, Auth dashboard settings and the TestFlight build are rollout steps the owner approves separately (Task 11 writes the runbook).
- **SQL house pattern:**
  - `private` SECURITY DEFINER bodies with `set search_path = ''`, plus `public` SECURITY INVOKER façades.
  - Explicit `revoke all … from public, anon, authenticated, service_role` before every grant.
  - Error codes: `42501` (no session / not allowed) and `22023` (invalid input).
- **Phone formats:** the app works in E.164 (`+447700900834`). `auth.users.phone` and every new table store digits only (`447700900834`). The hook's payload may carry a `+`, so strip non-digits.
- **Test mode:** the code is `000000`. It never appears in any screen, page, hint or accessibility label. An exchange is valid for 10 minutes after the code was sent, and the resend wait is 60 seconds.
- **Phone validity:** accept a number when `libphonenumber-js` says it is *possible* (right length for its country), not *valid*. The UK numbers reserved for fiction (`07700 900000`–`900999`), used as test friends, are reported invalid by its metadata. Checked on 27 October 2026 with libphonenumber-js 1.13.15.
- **Dependencies:** pin new ones exactly (`npm install --save-exact`). Append every new `*.test.ts` file to the `test` chain in `mobile/package.json`.
- **UI:**
  - Use the existing kit (`src/design/kit.tsx`, `ui.tsx`, `TickRow.tsx`): one heading of at most three words, one primary pill, chips for secondary actions.
  - Labels and hints carry full meaning (VoiceOver, Voice Control, Larger Text).
  - No Reanimated layout animations (`src/design/layoutAnimations.test.ts` guards this).
- **Copy:** protected wording (errors, recovery, privacy statements) keeps its exact text. New strings live in `src/domain/phoneCopy.ts`.
- **Navigator remounts:** the root `<Stack key={session?.user.id || "signed-out"}>` in `app/_layout.tsx` remounts on every sign-in. Anything that must survive a sign-in is a route reached through `app/account.tsx`, never local screen state.

## Review Focus

1. **Numbers in local or foreign formats:** a number typed with spaces, brackets, a leading 0, or from another country than the phone's region is stored as the right international number ("07700 900834" on a GB phone → `+447700900834`; "+1 (415) 555-2671" stays US). Pinned in Task 4 (`phone.test.ts`).
2. **Fiction-range test numbers:** they must be accepted although the library calls them invalid. Pinned in Task 4.
3. **000000 when it shouldn't work:** in live mode, or with no code sent in the last 10 minutes, it is a wrong code ("That code doesn’t match. Try again."), never a crash and never a sign-in. Pinned in Task 2 (SQL) and Task 5 (`phoneCode.test.ts`).
4. **A taken number at "Add your phone number":** the person stays signed in, sees the refusal, and can change the number or sign out. Pinned in Task 5 and Task 10 (`verify-phone.mjs`).
5. **Interrupted sign-ups and phone-less accounts:**
   - The app is killed after the code is verified but before the name is given; reopening lands on About you.
   - An account signed in with Apple, Google or email but no phone lands on Add your phone number.

   Pinned in Task 8 (`accountRoute.test.ts`).

---

### Task 1: Make the checks run on this Linux machine

**Files:**
- Modify: `scripts/test-database.sh` (the `work=` line)
- Create: `scripts/test-database-docker.sh`
- Create: `mobile/scripts/ensure-expo-env.mjs`
- Modify: `mobile/package.json` (`typecheck` script)
- Modify: `mobile/src/services/nativeImports.test.ts:17`

**Interfaces:**
- Produces: `./scripts/test-database-docker.sh [--hosted-baseline [CANDIDATE.sql ...]]`. It takes the same arguments as `test-database.sh` and is used by every later SQL step.

- [ ] **Step 1: Reproduce the failures.** `cd mobile && rm -f expo-env.d.ts && npm run check`. Expected: FAIL with `'hovered' does not exist in type 'PressableStateCallbackType'`. Then `node --import tsx src/services/nativeImports.test.ts`. Expected: FAIL with `ENOENT … expo-contacts/ios/Next/records/ContactQueryOptions.swift`.
- [ ] **Step 2: Fix both.**
  - Write `mobile/scripts/ensure-expo-env.mjs`. When `mobile/expo-env.d.ts` is missing, it writes exactly what `expo start` writes: `/// <reference types="expo/types" />\n\n// NOTE: This file should not be edited and should be in your git ignore\n`.
  - Set `"typecheck": "node scripts/ensure-expo-env.mjs && tsc --noEmit"`.
  - In `nativeImports.test.ts`, change `ios/Next/records` to `ios/next/records` (the package's real casing).
- [ ] **Step 3: Run `cd mobile && npm run check`.** Expected: exit 0, no `not ok` lines, and content validation prints its usual "8 original and 3 separately approved…" line.
- [ ] **Step 4: Make the SQL harness portable.**
  - In `scripts/test-database.sh` replace `mktemp -d /private/tmp/resbite-pg.XXXXXX` with `mktemp -d "${TMPDIR:-/tmp}/resbite-pg.XXXXXX"`.
  - Create `scripts/test-database-docker.sh` (executable). It resolves the repo root and runs `docker run --rm -u postgres -e RESBITE_PG_BIN=/usr/lib/postgresql/17/bin -v "$repo:/repo:ro" -w /tmp postgres:17 bash /repo/scripts/test-database.sh "$@"`.
- [ ] **Step 5: Run the database and worker suites.**
  - `./scripts/test-database-docker.sh`. Expected: last line `PASS: disposable SQL assertions (full); synthetic roster empty. …`
  - `./scripts/test-database-docker.sh --hosted-baseline`. Expected: `PASS: disposable SQL assertions (hosted); …`
  - `node --experimental-transform-types --test supabase/functions/_shared/*.test.ts`. Expected: `# fail 0`.
- [ ] **Step 6: Commit** `scripts/test-database.sh scripts/test-database-docker.sh mobile/scripts/ensure-expo-env.mjs mobile/package.json mobile/src/services/nativeImports.test.ts` with message "Run the checks on Linux: portable harness, Docker Postgres, generated Expo types, case-correct contacts path".

---

### Task 2: Test-mode codes in the database

**Files:**
- Create: `supabase/migrations/20261027120000_phone_accounts.sql`. The header comment says it is hosted-compatible, names its rollback (Task 3) and points at the spec.
- Modify: `supabase/tests/local/bootstrap.sql`:
  - `auth.users` gains `phone text unique, phone_confirmed_at timestamptz`;
  - add `create role supabase_auth_admin nologin;`.
- Create: `supabase/tests/phone-accounts.sql` (style of `supabase/tests/gi2.sql`: synthetic users, DO blocks that raise on a failed assertion, everything rolled back)
- Modify: `supabase/tests/hosted-baseline/tests.txt` (append `phone-accounts.sql`)

**Interfaces:**
- Produces:
  - `private.phone_mode(id boolean primary key default true check (id), test_mode boolean not null default true, changed_at timestamptz not null default now())`, seeded with one row with `test_mode = true`.
  - `private.test_codes(phone text primary key check (phone ~ '^[1-9][0-9]{6,14}$'), otp text not null check (otp ~ '^[0-9]{6}$'), sent_at timestamptz not null default now())`.
  - `private.test_mode_log(id bigint generated always as identity primary key, kind text not null check (kind in ('sent','exchanged')), phone_suffix text not null check (phone_suffix ~ '^[0-9]{2}$'), user_id uuid references auth.users(id) on delete set null, at timestamptz not null default now())`.
  - All three have RLS enabled and no client grants.
  - `private.phone_digits(p text) returns text`: immutable, digits only (`''` for null).
  - `public.send_sms_hook(event jsonb) returns jsonb`: execute granted to `supabase_auth_admin` only.
  - `public.exchange_test_code(p_phone text, p_code text) returns text`: execute granted to `anon, authenticated`.

- [ ] **Step 1: Write the failing SQL tests in `phone-accounts.sql`** (`<uid>` is a synthetic user):
  - `hook stores the code in test mode`: as `supabase_auth_admin`, `send_sms_hook('{"user":{"id":"<uid>","phone":"447700900834"},"sms":{"otp":"123456"}}')` returns `'{}'::jsonb`. `private.test_codes` then holds (`'447700900834'`, `'123456'`), and one `test_mode_log` row has `kind='sent'`, `phone_suffix='34'`, `user_id=<uid>`.
  - `hook prefers the new number`: with `"phone":"447700900001","new_phone":"+44 7700 900002"`, the row is for `'447700900002'`.
  - `a new code replaces the old one`: a second call for the same number with `"otp":"654321"` leaves one row with `otp='654321'`.
  - `live mode refuses and stores nothing`: after `update private.phone_mode set test_mode=false`, the hook returns `{"error":{"http_code":503,"message":"Text messages aren't set up yet."}}` and no row changes.
  - `malformed event is refused`: `"otp":"12ab56"` or no phone returns `{"error":{"http_code":400,"message":"Invalid code request."}}` and stores nothing.
  - `exchange returns the stored code for 000000 only`: as `anon`, after the first hook call:
    - `exchange_test_code('+44 7700 900834','000000') = '123456'`, and a `kind='exchanged'` log row exists;
    - `exchange_test_code('+44 7700 900834','123456') is null`;
    - an unknown number gives null;
    - after `update private.test_codes set sent_at = now() - interval '11 minutes'`, null;
    - in live mode, null;
    - no `exchanged` row is written for a null result.
  - `grants`: `anon`, `authenticated` and `service_role` calling `send_sms_hook` raise `42501`; `anon` reading `private.test_codes` raises `42501`.
- [ ] **Step 2: Run `./scripts/test-database-docker.sh`.** Expected: FAIL in `phone-accounts.sql` (function `public.send_sms_hook` does not exist).
- [ ] **Step 3: Implement the tables and functions above in the migration.**
  - **Hook:**
    - Target number: `private.phone_digits(coalesce(nullif(event->'user'->>'new_phone',''), event->'user'->>'phone'))`.
    - Validate the target against the table check and `otp` against `^[0-9]{6}$`, else the 400 error.
    - In test mode: upsert `test_codes` (setting `sent_at = now()`), log `sent` with `user_id = (event->'user'->>'id')::uuid` when it parses, return `'{}'`.
    - Otherwise return the 503 error.
  - **Exchange:**
    - Return null unless test mode is on and `p_code = '000000'`.
    - Select the stored `otp` for `private.phone_digits(p_phone)` with `sent_at > now() - interval '10 minutes'`.
    - When found, log `exchanged` with `user_id = (select id from auth.users where phone = <digits>)`.
- [ ] **Step 4: Run the suites.**
  - `./scripts/test-database-docker.sh`. Expected: `PASS: phone-accounts.sql` and the final full PASS line.
  - `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261027120000_phone_accounts.sql`. Expected: `PASS: 20261027120000_phone_accounts applies on the hosted baseline` and `PASS: phone-accounts.sql (hosted baseline)`.
- [ ] **Step 5: Commit** with message "Store test-mode codes from the Send SMS hook and swap 000000 for them".

---

### Task 3: Accounts confirmed by phone

**Files:**
- Modify: `supabase/migrations/20261027120000_phone_accounts.sql` (append)
- Modify: `supabase/migrations/20261022120001_gi2_local_delivery_and_deletion.sql` (its `private.user_eligible` body only). It is local-only and was never applied, so editing it is allowed. Record its new sha256 in Task 11.
- Modify: `supabase/rollback/20261022120001_gi2_local_delivery_and_deletion.rollback.sql` and, if its assertions pin the old body, `supabase/tests/gi2-rollback.sql`
- Create: `supabase/rollback/20261027120000_phone_accounts.rollback.sql`
- Create: `supabase/tests/hosted-baseline/20261027120000_phone_accounts.before.sql` and `.after.sql`, modelled on `20261022120000_gi2_guest_accounts.before.sql`/`.after.sql`. They record function fingerprints before, check the new objects and grants after, and rehearse the rollback.
- Modify: `supabase/tests/phone-accounts.sql` (append)

**Interfaces:**
- Consumes: Task 2's migration file.
- Produces:
  - `private.user_eligible(uuid)` with confirmed meaning `(u.email_confirmed_at is not null or u.phone_confirmed_at is not null)`. It delegates the leaving check to `not private.deletion_pending(p_user)`; the local companion's `deletion_pending` already adds the deletion-job check.
  - `private.account_access_status()`: returns `'unconfirmed'` only when both `email_confirmed_at` and `phone_confirmed_at` are null (other conditions unchanged).
  - `private.save_registration_details(jsonb,jsonb)`: the `20260923150902` body with only its confirmed check widened the same way.
  - `private.beta_access.source` check: `in ('link','maintainer')`.
  - `private.app_sessions(user_id uuid primary key references auth.users(id) on delete cascade, first_at timestamptz not null default now(), last_at timestamptz not null default now())`.
  - `public.note_app_session() returns void`: authenticated; upserts the caller's row and bumps `last_at`.
  - `private.used_app(p_user uuid) returns boolean`: used by Plan 2's contact lookup.
  - `public.attest_age(p_terms_version text) returns void`: authenticated; inserts into `private.age_attestations` once, never overwriting; `22023` unless `p_terms_version ~ '^[0-9]{4}-[0-9]{2}$'`.

- [ ] **Step 1: Append failing SQL tests to `phone-accounts.sql`:**
  - `phone-only account with a maintainer grant is approved`: a user with `phone='447700900101'`, `phone_confirmed_at=now()`, `email=null` and a `beta_access` row with `source='maintainer'` gets `private.user_eligible(id)` true and `account_access_status()->>'status' = 'approved'`.
  - The same user without the grant gets `'access_pending'`.
  - Neither email nor phone confirmed gets `'unconfirmed'`.
  - An email-confirmed roster tester is still `'approved'`.
  - A phone-only user with `profiles.deletion_requested_at` set is not eligible.
  - `save_registration_details(null, '{"birth_date":null,"phone":null,"city":"Leeds","interests":[]}')` succeeds for a phone-confirmed user awaiting access.
  - `note_app_session()` called twice leaves one row with `last_at >= first_at`, and `private.used_app(id)` is true. As `anon` it raises `42501`.
  - `attest_age('2026-10')` then `attest_age('2026-11')` leaves one row with `terms_version='2026-10'`. `attest_age('oct')` raises `22023`; `anon` raises `42501`.
  - Inserting `beta_access` with `source='other'` raises `23514`.
- [ ] **Step 2: Run `./scripts/test-database-docker.sh`.** Expected: FAIL on the first new assertion.
- [ ] **Step 3: Implement the Produces list in the migration.**
  - Redefinitions copy the hosted bodies (`20261022120000` for `user_eligible`, `20260923150059` for `account_access_status`, `20260923150902` for `save_registration_details`) and change only what is listed.
  - Grants for redefined functions stay exactly as they were.
  - Change the companion's `user_eligible` to the same new body.
  - Write the rollback. It:
    - restores the three previous bodies;
    - deletes `source='maintainer'` grants, then restores the `('link')` check;
    - drops every object Tasks 2 and 3 created.
  - Point the companion rollback's `user_eligible` restore at this plan's body.
- [ ] **Step 4: Run all three suites.**
  - `./scripts/test-database-docker.sh`. Expected: `PASS: phone-accounts.sql`, `PASS: gi2-rollback.sql`, final full PASS.
  - `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261027120000_phone_accounts.sql`. Expected: applies, its after-checks pass, `PASS: phone-accounts.sql (hosted baseline)`.
  - Worker tests. Expected: `# fail 0`.
- [ ] **Step 5: Commit** with message "Let a confirmed phone count as a confirmed account; record app use and the age tick; add the rollback".

---

### Task 4: Phone number rules

**Files:**
- Modify: `mobile/package.json`: `npm install --save-exact libphonenumber-js` (1.13.15 or what npm resolves), plus add `src/domain/phone.test.ts` to the chain
- Create: `mobile/src/domain/phone.ts`
- Test: `mobile/src/domain/phone.test.ts`

**Interfaces:**
- Produces:
  - `type PhoneResult = { ok: true; e164: string } | { ok: false; message: string }`
  - `INVALID_PHONE = "Enter a valid mobile number."`
  - `parsePhone(input: string, region: string): PhoneResult`: uses `parsePhoneNumberFromString` from `libphonenumber-js/min` and accepts when `isPossible()`.
  - `deviceRegion(locale?: string): string`: the locale's region subtag in upper case, falling back to `"GB"`. The default argument is `Intl.DateTimeFormat().resolvedOptions().locale`.
  - `formatPhone(e164: string): string`: international format.
  - `phoneEnding(e164: string): string`: the last two digits (Plan 2).
  - `phoneVerified(user: { phone?: string | null; phone_confirmed_at?: string | null } | null): boolean`

- [ ] **Step 1: Write failing tests:**
  - `parsePhone("07700 900834","GB")` → `{ok:true,e164:"+447700900834"}`
  - `parsePhone("+44 7700 900001","AR")` → `+447700900001`
  - `parsePhone("(020) 7946 0018","GB")` → `+442079460018`
  - `parsePhone("+1 (415) 555-2671","GB")` → `+14155552671`
  - `parsePhone("011 15 2345-6789","AR")` → `+5491123456789`
  - `parsePhone("12","GB")`, `("","GB")` and `("abc","GB")` → `{ok:false,message:INVALID_PHONE}`
  - `deviceRegion("en-GB")="GB"`, `deviceRegion("es-AR")="AR"`, `deviceRegion("en")="GB"`
  - `formatPhone("+447700900834")="+44 7700 900834"`
  - `phoneEnding("+447700900834")="34"`
  - `phoneVerified` is true only when both fields are non-empty; null user → false
- [ ] **Step 2: Run `cd mobile && node --import tsx src/domain/phone.test.ts`.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `phone.ts`.**
- [ ] **Step 4: Run the test, then `npm run check`.** Expected: PASS; check exits 0.
- [ ] **Step 5: Commit** with message "Parse, format and check phone numbers".

---

### Task 5: Phone code and account calls

**Files:**
- Create: `mobile/src/services/phoneCode.ts`, test `mobile/src/services/phoneCode.test.ts`
- Create: `mobile/src/services/phoneAccount.ts`, test `mobile/src/services/phoneAccount.test.ts`
- Modify: `mobile/package.json` (test chain)

**Interfaces:**
- Consumes: Task 2's `exchange_test_code`; Task 3's `note_app_session` and `attest_age`.
- Produces, in `phoneCode.ts`. It mirrors `emailCode.ts`: injected dependencies, the same connection rule (status 0 or ≥ 500) and the same `mismatch`, `expired`, `wait` and `connection` copy, plus:
  - `type AuthError = { message: string; status?: number; code?: string } | null`
  - `type PhoneCodeDeps = { signInWithOtp(a: { phone: string; options: { shouldCreateUser: boolean } }): Promise<{ error: AuthError }>; updatePhone(phone: string): Promise<{ error: AuthError }>; verifyOtp(a: { phone: string; token: string; type: "sms" | "phone_change" }): Promise<{ error: AuthError }>; exchangeTestCode(phone: string, code: string): Promise<string | null>; now(): number }`
  - `type PhonePurpose = "signup" | "signin" | "add"`
  - `sendPhoneCode(d, e164, purpose): Promise<{ ok: true; resendAt: number } | { ok: false; message: string; reason?: "no_account" | "taken" }>`:
    - `signup` → `signInWithOtp` with `shouldCreateUser: true`;
    - `signin` → `shouldCreateUser: false`;
    - `add` → `updatePhone`.
  - `verifyPhoneCode(d, e164, token, sentAt, purpose): Promise<{ ok: true } | { ok: false; message: string; clear: boolean }>`:
    - The type is `"phone_change"` for `add`, else `"sms"`.
    - When the digits are `000000`, it first calls `exchangeTestCode`. A returned code is verified in place of 000000; null verifies `000000` as typed.
    - A thrown exchange is a connection failure (`clear: false`).
  - `PHONE_CODE_COPY.noAccount = "No Resbite account uses this number yet."`
  - `PHONE_CODE_COPY.taken = "This number already belongs to another Resbite account. Use a different number, or sign out and sign in with that number."`
  - `phoneCodeDeps`, bound lazily to `supabase.auth` and to `supabase.rpc("exchange_test_code", { p_phone, p_code })`.
- Produces, in `phoneAccount.ts`:
  - `noteAppSession(d?): Promise<void>`: never throws.
  - `rememberAttestation(termsVersion: string): void`: keeps the tick in module memory, so it survives the navigator remount on sign-in (Global Constraints).
  - `flushAttestation(d?): Promise<void>`: when a tick is pending, calls `attest_age` with `{ p_terms_version }` and clears it on success. On failure it keeps it for the next account refresh. Never throws.

- [ ] **Step 1: Write failing tests in `phoneCode.test.ts`** with recording stubs:
  - send: `signup` passes `shouldCreateUser: true` and returns `resendAt = now + 60000`; `signin` passes `false`; `add` calls `updatePhone("+447700900834")`.
  - send errors:
    - `{code:"otp_disabled",status:422}` on signin → `{ok:false,reason:"no_account",message:PHONE_CODE_COPY.noAccount}`;
    - `{code:"phone_exists",status:422}` on add → `reason:"taken"`;
    - `{status:429}` → wait copy;
    - `{status:0}` → connection copy.
  - verify, test mode: `exchangeTestCode` returns `"123456"` → `verifyOtp` is called once with `token:"123456"`, `type:"sms"`. For `add` the type is `"phone_change"`.
  - verify, live mode: `exchangeTestCode` returns null → `verifyOtp` is called with `"000000"` and its error yields the mismatch copy with `clear: true`.
  - verify, not 000000: `exchangeTestCode` is never called.
  - verify, exchange throws → connection copy, `clear: false`.
  - verify, bad error 10 minutes after `sentAt` → expired copy.
  - `"12345"` → mismatch without calling anything.
- [ ] **Step 2: Write failing tests in `phoneAccount.test.ts`:**
  - `noteAppSession` resolves when the stub rejects.
  - With nothing remembered, `flushAttestation` makes no call.
  - After `rememberAttestation("2026-10")`, a failing stub keeps it pending (a second flush calls again). A succeeding stub is called with `{p_terms_version:"2026-10"}` and clears it (a third flush makes no call).
- [ ] **Step 3: Run both tests.** Expected: FAIL (modules missing).
- [ ] **Step 4: Implement both modules.**
- [ ] **Step 5: Run both tests and `npm run check`.** Expected: PASS.
- [ ] **Step 6: Commit** with message "Send and check phone codes, with the test-mode swap; note app use and the age tick".

---

### Task 6: Linking Apple and Google to an account

**Files:**
- Modify: `mobile/src/services/appleSignIn.ts`: `AppleCredential` gains `email: string | null`, and `requestCredential` returns `credential.email`.
- Create: `mobile/src/services/identityLink.ts`, test `mobile/src/services/identityLink.test.ts`
- Modify: `mobile/package.json` (test chain)

**Interfaces:**
- Consumes: `appleSignInDeps.randomUUID`, `.sha256`, `.requestCredential`; `appleName`; `appleNameToSave` from `src/domain/guestAccount.ts`; `exchangeAuthCode` from `src/services/authCallback.ts`.
- Produces:
  - `type LinkResult = { ok: true; name: string | null; email: string | null } | { ok: false; cancelled: true } | { ok: false; cancelled: false; message: string }`
  - `type AppleLinkDeps = Pick<AppleSignInDeps, "randomUUID" | "sha256" | "requestCredential"> & { linkIdToken(a: { provider: "apple"; token: string; nonce: string }): Promise<{ error: AuthError }>; saveName(name: string): Promise<void> }`
  - `type GoogleLinkDeps = { linkUrl(redirectTo: string): Promise<{ url: string | null; error: AuthError }>; openAuthSession(url: string, redirectTo: string): Promise<{ type: string; url?: string }>; exchange(code: string): Promise<void>; googleIdentity(): Promise<{ name: string | null; email: string | null }>; saveName(name: string): Promise<void>; redirectTo: string }`
  - `linkApple(d): Promise<LinkResult>` and `linkGoogle(d): Promise<LinkResult>`. Both save the provider's name as `display_name` only when `appleNameToSave` allows it (no name yet). A failed name save is not an error.
  - `LINK_COPY.appleTaken = "This Apple ID already has a Resbite account. Sign out, then sign in with Apple."`
  - `LINK_COPY.googleTaken = "This Google account already has a Resbite account. Sign out, then sign in with Google."`
  - `appleLinkDeps` and `googleLinkDeps`:
    - Apple: `supabase.auth.linkIdentity({ provider, token, nonce })`, the id-token overload.
    - Google: `supabase.auth.linkIdentity({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } })` with `WebBrowser.openAuthSessionAsync`, the same redirect and code exchange as `useAuthFlow.google()`.
    - `googleIdentity` reads `full_name ?? name` and `email` from the `google` entry of `user.identities[].identity_data`.

- [ ] **Step 1: Write failing tests:**
  - Apple success: `linkIdToken` gets the raw nonce, and the result is `{ok:true,name:"Sam Patel",email:"sam@example.com"}`.
  - `ERR_REQUEST_CANCELED` → `{ok:false,cancelled:true}` and nothing linked.
  - `{code:"identity_already_exists",status:422}` → `LINK_COPY.appleTaken`.
  - `{status:0}` → connection copy.
  - Google success: `exchange` gets the `code` query value from the returned URL.
  - Google `{type:"cancel"}` → cancelled.
  - Google taken → `LINK_COPY.googleTaken`.
  - `saveName` is not called when `appleNameToSave` returns null.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and `npm run check`.** Expected: PASS. `appleSignIn.test.ts` still passes with the extra field.
- [ ] **Step 5: Commit** with message "Link Apple and Google to a signed-in account and take their name".

---

### Task 7: Phone sign-up and sign-in screen

**Files:**
- Create: `mobile/src/design/CodeField.tsx`: move `CodeField` out of `src/design/GuestSteps.tsx` unchanged; GuestSteps imports it.
- Create: `mobile/src/design/PhoneField.tsx`: a `FieldCard` with `keyboardType="phone-pad"`, `textContentType="telephoneNumber"`, `autoComplete="tel"`, label `PHONE_COPY.numberField`.
- Create: `mobile/src/domain/phoneCopy.ts`
- Create: `mobile/src/state/usePhoneVerification.ts`
- Create: `mobile/app/auth/phone.tsx`

**Interfaces:**
- Consumes: Tasks 4–5; `TickRow`, `GUEST_COPY.tick`, `.terms` and `.ageHelper`; `TERMS_VERSION`; `formatCountdown`; `useAuthFlow().apple` and `.google`, used only on the sign-in intent.
- Produces:
  - `PHONE_COPY`:
    - `signupHeading: "Your number"`, `signinHeading: "Sign in"`, `codeHeading: "Enter the code"`
    - `numberField: "Mobile number"`, `numberHint: "We’ll text you a 6-digit code."`
    - `send: "Send code"`
    - `codeBody: (formatted) => \`We sent a 6-digit code to ${formatted}.\``
    - `resendIn: GUEST_COPY.resendIn`, `resend: "Send a new code"`, `changeNumber: "Change number"`
    - `createInstead: "Create an account"`, `useEmail: "Use email and password"`
    - `aboutHeading: "About you"`, `nameField: "Your name"`, `continue: "Continue"`
    - `addHeading: "Add your number"`, `addBody: "Your friends find and invite you by your number."`
  - `usePhoneVerification(purpose: PhonePurpose)` returns:
    - `step: "number" | "code"`;
    - `input`, `setInput`, `e164: string | null`, `ticked`, `setTicked` (the tick is required only for `signup`);
    - `digits`, `setDigits`, `secondsLeft`, `busy`, `error`, `reason: "no_account" | "taken" | null`;
    - `send(): Promise<void>`, `verify(code: string): Promise<boolean>`, `resend(): Promise<void>`, `changeNumber(): void`.

    For `signup`, it calls `rememberAttestation(TERMS_VERSION)` before verifying. After a successful verification:
    - `signup` and `signin` call `router.replace("/account")`. The sign-in may already have remounted the navigator onto `/account`, which is fine.
    - `add` awaits `useAccount().refresh()`, then `router.replace("/account")`.
  - Route `/auth/phone?intent=signup|signin` (default `signup`):
    - **Number step:**
      - Heading by intent, `PhoneField`, and the 18+ `TickRow` for signup only.
      - Primary `PHONE_COPY.send`, disabled until ticked on signup, with hint `ageHelper`.
      - Signin adds Apple and Google chips (via `useAuthFlow`) and a `TextAction` `PHONE_COPY.useEmail` → `/auth?mode=login`.
      - `reason === "no_account"` shows `TextAction` `createInstead`, which switches intent to signup and keeps the number.
    - **Code step:**
      - `CodeField`, which submits at six digits as in GI2.
      - The resend countdown, `changeNumber`.
      - VoiceOver focus moves to each new heading (`useFocusOnChange`).

- [ ] **Step 1: Move `CodeField`.** Run `node scripts/verify-links.mjs` against Expo web (`npx expo start --web --port 8081` in another shell). Expected: exit 0, proving the guest screen is unchanged.
- [ ] **Step 2: Build `phoneCopy.ts`, `PhoneField`, the hook and the route.** The region for `parsePhone` comes from `deviceRegion()`. A parse failure shows `INVALID_PHONE` under the field without a network call.
- [ ] **Step 3: Run `npm run check`.** Expected: PASS. The browser scripts for this screen come in Task 10.
- [ ] **Step 4: Commit** with message "Sign up and sign in with a phone number and a code".

---

### Task 8: Routing, About you and Add your number

**Files:**
- Create: `mobile/src/domain/accountRoute.ts`, test `mobile/src/domain/accountRoute.test.ts`
- Create: `mobile/app/about-you.tsx`, `mobile/app/add-phone.tsx`
- Modify: `mobile/app/account.tsx`:
  - apply `accountGate` before the existing branches;
  - remove the `!reviewed → /account-details?setup=1` redirect (CI-P11).
- Modify: `mobile/app/_layout.tsx`: `about-you` and `add-phone` inside `<Stack.Protected guard={Boolean(session)}>`. Add both paths to the cold-start exceptions next to `/auth` only if a deep link needs them; it doesn't today, so leave the exceptions unchanged.
- Modify: `mobile/src/state/AccountState.tsx`: after a successful refresh with status `approved` or `access_pending`:
  - call `noteAppSession()` once per account per app launch;
  - call `flushAttestation()` on every such refresh.
- Modify: `mobile/app/(tabs)/profile.tsx`: the muted line under the name shows `formatPhone(user.phone)` when there is no email.
- Modify: `mobile/package.json` (test chain)

**Interfaces:**
- Consumes: `phoneVerified`, `formatPhone` (Task 4); `usePhoneVerification("add")` (Task 7); `linkApple`, `linkGoogle` (Task 6); `nameFromSession` (`guestAccount.ts`).
- Produces:
  - `type AccountGate = "add-phone" | "about-you" | null`
  - `accountGate(i: { status: string; phoneVerified: boolean; name: string | null; profileReady: boolean }): AccountGate`:
    - status `approved` or `access_pending` without a phone → `"add-phone"`;
    - with a phone, but `!profileReady` and no name → `"about-you"`;
    - otherwise `null` (including `unconfirmed`, `checking`, `error`).
  - `/about-you`:
    - Heading `aboutHeading`; a name `FieldCard` prefilled with `nameFromSession(user, null)`.
    - Apple chip (when available) and Google chip run `linkApple` and `linkGoogle`. A returned name fills the field, and a link error shows under the chips.
    - Primary `continue` saves `supabase.auth.updateUser({ data: { display_name } })` for a trimmed name of 1–80 characters, then `router.replace("/account")`.
    - Sign out chip.
  - `/add-phone`:
    - Heading `addHeading`, the `addBody` line, `PhoneField` and the code step from `usePhoneVerification("add")`.
    - `reason === "taken"` keeps the refusal on screen with Change number.
    - Sign out chip. No other exit.
    - Success handling is the hook's (Task 7).

- [ ] **Step 1: Write failing `accountRoute.test.ts` cases:**
  - `approved`, no phone → `"add-phone"`
  - `access_pending`, no phone → `"add-phone"`
  - `approved`, phone, no name, `profileReady:false` → `"about-you"`
  - `approved`, phone, no name, `profileReady:true` → `null`
  - `access_pending`, phone, name `"Sam"` → `null`
  - `unconfirmed`, no phone → `null`
  - `checking` → `null`
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `accountGate`, both screens and the edits above.** `account.tsx` reads `phoneVerified(user)` and `nameFromSession(user, null)` from `useAccount().user`.
- [ ] **Step 4: Run the test and `npm run check`.** Expected: PASS.
- [ ] **Step 5: Commit** with message "Route accounts without a phone to Add your number and nameless ones to About you".

---

### Task 9: Entry points

**Files:**
- Modify: `mobile/app/introduction.tsx:31`: `router.replace("/auth/phone")`
- Modify: `mobile/app/index.tsx:68`: "I have an account" → `router.push({ pathname: "/auth/phone", params: { intent: "signin" } })`
- Modify: `mobile/app/auth/index.tsx`:
  - both "Create account" `TextAction`s (lines 231 and 250) go to `router.push("/auth/phone")`;
  - when the `mode` param is `register`, render `<Redirect href="/auth/phone" />`.
- Modify: `mobile/app/account.tsx`: the `unconfirmed` card's "Email help" chip is unchanged. The `access_pending` card's email line shows the phone (`formatPhone`) when there is no email.

**Interfaces:**
- Consumes: Task 7's route.
- Produces: none. The email and password sign-in, reset and confirm modes keep working for existing accounts.

- [ ] **Step 1: Make the edits.**
- [ ] **Step 2: Run `npm run check`.** Expected: PASS.
- [ ] **Step 3: Commit** with message "Start sign-up and sign-in with a phone number; keep email and password for existing accounts".

---

### Task 10: Browser checks and captures

**Files:**
- Create: `mobile/scripts/verify-phone.mjs`, in the style of `verify-account.mjs`. It intercepts every Supabase call:
  - `POST /auth/v1/otp`;
  - `POST /auth/v1/verify` (returns a session);
  - `PUT /auth/v1/user`;
  - `GET /auth/v1/user` (with `phone`, `phone_confirmed_at` and `user_metadata`);
  - `POST /rest/v1/rpc/exchange_test_code`, `account_access_status`, `note_app_session` and `attest_age`.
- Modify: `mobile/scripts/verify-auth.mjs`, `verify-registration.mjs`, `verify-account.mjs`, `verify-signup-callback.mjs` and `qa-helpers.mjs` wherever they start sign-up through `mode: "register"`, the introduction's Create account, or expect the `/account-details?setup=1` redirect.
- Modify: `mobile/scripts/review-ui.mjs`: capture `/auth/phone` (number with tick, code), `/auth/phone?intent=signin`, `/about-you` and `/add-phone`, with its "taken" refusal, at 390 and 320 px and under forced Larger Text at 320 px, with the existing no-clipping check.

- [ ] **Step 1: Write `verify-phone.mjs` cases:**
  1. **Sign-up:**
     - "Send code" stays disabled until the 18+ tick.
     - "12" shows "Enter a valid mobile number." with no `/otp` request.
     - "07700 900834" sends `phone: "+447700900834"`.
     - A wrong code (`/verify` 400) shows the mismatch copy and empties the cells.
     - `000000` calls `exchange_test_code` with `{p_phone:"+447700900834",p_code:"000000"}`, then `/verify` with token `123456`, then `attest_age` with `{p_terms_version:"2026-10"}`, and lands on About you.
     - Name "Sam" → `PUT /auth/v1/user` with `data.display_name:"Sam"` → `/account`.
  2. **Sign-in:** an unknown number (`/otp` 422 `otp_disabled`) shows "No Resbite account uses this number yet." and "Create an account", which keeps the number and shows the tick.
  3. **Gate:**
     - An approved email account without a phone opens on "Add your number".
     - A `PUT /auth/v1/user` 422 `phone_exists` shows the taken copy and the person stays signed in.
     - A good number and 000000 → `/verify` with `type: "phone_change"` → the app.
  4. **Interrupted sign-up:** a phone-verified session without a name opens on About you after reload.
  5. **No test code anywhere:** the page never contains the text `000000` other than inside the code inputs.
- [ ] **Step 2: Start Expo web** (`cd mobile && npx expo start --web --port 8081 --clear`). Run `node scripts/verify-phone.mjs`. Expected: PASS. Any failure is a defect in Tasks 7–9, fixed in Step 3.
- [ ] **Step 3: Fix what the cases expose.** Run all `node scripts/verify-*.mjs` and `node scripts/review-ui.mjs`. Expected: every script exits 0.
- [ ] **Step 4: Run `npx expo export --platform ios --output-dir dist-ios`.** Expected: success. Then `rm -rf dist-ios`.
- [ ] **Step 5: Commit** with message "Check phone sign-up, sign-in and Add your number in the browser; capture the new screens".

---

### Task 11: Records and rollout runbook

**Files:**
- Create: `qa/phone-accounts-2026-10-27/README.md`
- Modify: `docs/implementation-status.md` (new dated section), `knowledge-base/08-decisions.md` (a "Contact invitations, 27 October 2026" section with CI-D1 to CI-D13, CI-P1 to CI-P13 and this plan's calls), `supabase/README.md` (the new functions and the hook), `supabase/templates/README.md` (only if a template changed; none should)

**Interfaces:** none.

- [ ] **Step 1: Write the runbook.** None of these steps is run in this task; each is done later with the owner's approval.
  1. **Migration:**
     - Owner approval by file name and sha256 of `20261027120000_phone_accounts.sql`.
     - Hosted before/after snapshots into `qa/phone-accounts-2026-10-27/`.
     - Apply; advisors.
     - Append the line to `supabase/tests/hosted-baseline/migrations.txt` with its hosted version.
  2. **Auth dashboard:**
     - Phone provider on.
     - Hooks → Send SMS → Postgres → `public.send_sms_hook`.
     - SMS OTP length 6 and expiry 600 seconds.
     - Raise the SMS-sent rate limit for testing.
     - "Allow manual linking" on.
     - Check that phone sign-in works with the hook standing in for a provider. If Supabase still demands a provider, note what it asks for and stop.
     - **Prove the real path once:**
       1. Add one Supabase test number (dashboard "Test phone numbers", fixed code).
       2. Briefly set `test_mode = false`.
       3. Sign in with that number and its fixed code.
       4. Set `test_mode = true` again and remove the test number.
  3. **Grant access to test phone accounts:**

     ```sql
     insert into private.beta_access(user_id, source) values (:user_id, 'maintainer') on conflict (user_id) do nothing;
     ```

     Test numbers come from `+44 7700 900000`–`900999`.
  4. **Build:** a TestFlight build from `contact-invitations`, then the owner's iPhone check:
     - sign up with a test number and 000000;
     - About you with Apple, then with Google on a second account;
     - sign out and sign in by number;
     - the owner's own account gets Add your number;
     - a taken number is refused;
     - Larger Text and VoiceOver on the four new screens.
  5. **Known limit, until Plan 2's account folding:** someone who creates a phone account by mistake while already having an Apple, Google or email account gets "already has a Resbite account". Their number is then held by the new, empty account. The owner removes that empty user in the dashboard.
  6. **Not live with this plan:**
     - Local-only checks still read `email_confirmed_at`: notification recipients, deletion requests and intents.
     - Plan 4 (push) and the deletion milestone must widen them before phone-only accounts get notices or can delete.
     - `join_by_link` (GI2, hosted) still requires a confirmed email. Plan 3 replaces it.
  7. **Turning test mode off later:**

     ```sql
     update private.phone_mode set test_mode = false, changed_at = now();
     ```

     Do this only after a real SMS sender replaces the hook body.
  8. **Rollback:**
     - Serve the previous build.
     - Run `supabase/rollback/20261027120000_phone_accounts.rollback.sql` in one transaction with the owner's approval.
     - Revert the dashboard settings.
     - Phone-only accounts lose access until re-applied.
- [ ] **Step 2: Update the three documents.** Record the companion migration's new sha256 and say why it changed.
- [ ] **Step 3: Run `cd mobile && npm run check`, both harness modes and the worker tests one last time.** Expected: all pass.
- [ ] **Step 4: Commit** with message "Record phone accounts: decisions, status and the rollout runbook".
