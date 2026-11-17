# Phone Codes Implementation Plan (App Store readiness plan 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign-in codes really arrive by text message from Twilio, the `000000` test path is gone from the app, the link site and the database, the test-mode exposure is reviewed and recorded, and the Auth settings that guard paid SMS are restored and recorded.

**Architecture:** Supabase Auth's Send SMS hook becomes an **HTTP hook** pointing at a new Edge Function, `send-sms`. The function checks Auth's Standard Webhooks signature, builds one GSM-7 text and posts it to Twilio's Messages API through a Messaging Service, then answers Auth within its 5-second budget. A second route on the same function, `/send-sms/sweep`, runs daily from pg_cron and deletes Twilio's message records once they are final, as the Privacy Policy proposes. The app and the site stop calling `exchange_test_code`. One owner sitting switches the hook, turns test mode off, empties the stored codes, ends every session and reviews the log into the breach log (BR-2026-001). A later migration drops the test-mode objects. CAPTCHA is designed here, vendor-agnostic, and stays blocked until the owner picks the vendor.

**Tech Stack:** Supabase Edge Functions (Deno; tested under Node 22 with tsx), Web Crypto (HMAC-SHA256), Twilio Programmable Messaging REST API (2010-04-01), PostgreSQL 17 (Docker harness), Expo SDK 57 / React Native 0.86 (`mobile/`), the link site's plain ES modules (`links/`), Playwright headless checks.

**Spec:** `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md` (rows SI-1, WEB-4, OPS-5, OPS-9, PRV-7; deliverables C1, C11, B12, B16, D5, D6, D10, F5, F14; section 6 steps 11 and 21), plus `knowledge-base/08-decisions.md`, section "App Store readiness (AS), 17 November 2026" (AS-D5: Twilio through the Send SMS hook, test mode and the swap end in the same sitting, the CAPTCHA vendor open; AS-D8: the section 5 retention table applies). Where they differ, the AS section wins.

**Branch:** `asr-1-phone-codes`, from `app-store-readiness` at `83d75eb`. Merging to `main` is the owner's choice.

**Tasks:** 9. Tasks 1 to 6 are the build; Tasks 7 to 9 (CAPTCHA) are **blocked until the owner picks the vendor (AS-D5)**. Then "Rollout (owner-run)".

## Global Constraints

- **Every hosted step is owner-run, with the owner's explicit approval at the time:** Supabase (SQL, dashboard, function deploy, secrets, Vault, cron), Vercel, Twilio's console, EAS, TestFlight and App Store Connect. Files are approved by name and sha256. Never `supabase db push`, never `supabase migration repair --status reverted`, never `supabase db pull`. The apply pattern: a hash-guarded owner script that runs `supabase db query --linked -f` on the file wrapped in `begin;`/`commit;` (with a guard `do` block first), then `supabase migration repair --status applied <version> --linked --yes`, with `supabase/ops/hosted-fingerprint.sql` and `supabase/ops/hosted-counts.sql` snapshots before and after, recorded in `qa/phone-codes-2026-11-17/README.md`. Model: the open-beta rollout (`supabase/migrations/20261116120000_open_beta.sql`, `supabase/rollback/20261116120000_open_beta.rollback.sql`, `supabase/tests/hosted-baseline/20261116120000_open_beta.before.sql`/`.after.sql`, `qa/open-beta-2026-11-16/`) and the owner-script shape in `qa/chat-release/README.md:373-471`.
- **Migration timestamps for this plan:** `20261117100000` to `20261117109999` only. This plan uses one: `20261117100000_phone_test_mode_retired.sql`. Timestamps follow the hosted apply order (roadmap `docs/superpowers/plans/2026-11-17-asr-0-roadmap.md`): sitting 2 below applies `20261117100000` **before** plan 2's `20261117110000`. If BR-2026-001 is still open when plan 2's sitting is ready, rename this file (and its rollback, its rehearsal pair and its line in `tests.txt`) to a free timestamp after the last applied AS version, before its hash is approved, so the history stays in order.
- **Migrations are hosted-compatible.** The retiring migration drops only objects on the hosted baseline. Its rollback restores the hosted bodies: `public.send_sms_hook` and `public.exchange_test_code` from `supabase/migrations/20261030130000_phone_key.sql:26-47` and `:52-74` (sha256 `d7cf188f6b63d14453a2b34d6c8c85838ed196d7a06e01e3bd94c66ae0a14667`), their grants and the three tables from `supabase/migrations/20261027120000_phone_accounts.sql:13-41`, `:71-72` and `:97-98` (sha256 `208f399152d394460941272ffdeffaa1189883ff251ed37d77a3ab69367f5ddc`). Check both hashes before copying; if one differs, stop and ask. A rollback holds no psql meta-command (the owner runs it through `supabase db query`).
- **Every migration has** a rollback in `supabase/rollback/`, a hosted-baseline rehearsal (`.before.sql`/`.after.sql`), a SQL test in `supabase/tests/` listed in `supabase/tests/hosted-baseline/tests.txt`, and passes `bash scripts/test-database-docker.sh` (full mode) and `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117100000_phone_test_mode_retired.sql` (plus any other pending AS candidates, in order, per `supabase/README.md:162`). Read `supabase/README.md` first.
- **Commands.** App: `cd mobile && npm test` (node:test through tsx, the whole chain including `../links/*.test.mjs`), `cd mobile && npm run typecheck` (on this Linux box it needs the gitignored `mobile/expo-env.d.ts`; `npx expo start` writes it). One app test file: `cd mobile && node --import tsx src/services/phoneCode.test.ts`. Edge tests, from the repository root: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`. Link-site browser checks, from `mobile/`: `node --import tsx ../links/verify-personal.mjs` and `../links/verify-open-link.mjs`. App browser checks: Expo web on port 8081 with fixture values (`EXPO_PUBLIC_SUPABASE_URL=https://ewcsgvhuojxdpaspwsrx.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=qa-fixture-key npx expo start --web --port 8081 --clear`), then `node scripts/verify-phone.mjs` and `node scripts/verify-contact-invites.mjs`. Browsers run headless.
- **Never in the repo:** a secret or secret value, a real phone number, a real person's email, an account id, the hook secret, Twilio SIDs or keys, the sweep secret, the CAPTCHA secret. Test numbers come from `+44 7700 900000` to `900999`; test SIDs are obviously fake (`ACtest`, `SKtest`, `MGtest`). Never create `mobile/.env.local`. No service-role key in the app. Function secrets are recorded **by name only**.
- **Never log** a phone number, a code, a message body, a token or an upstream response body. The function logs an outcome word, an HTTP status and Twilio's numeric error code.
- **Copy:** plain British English, short sentences; the app and the site write the apostrophe as ’ (U+2019). The text message itself is the one exception: GSM-7 characters only, so it has no apostrophe at all (Decision 4). The public documents are called "Privacy Policy", "Terms of Use", "Support" and "Delete your account".
- **Order:** the app change (Task 3) ships only in a build made after the switch-off sitting; the site change (Task 4) deploys inside that sitting; the retiring migration runs only after BR-2026-001 is recorded; CAPTCHA is never switched on in Supabase before a build and the site send its token.
- **Other AS plans and sessions edit the same records** (`docs/compliance/`, `docs/legal/`, `qa/app-store-release/README.md`, `knowledge-base/08-decisions.md`, `docs/implementation-status.md`, `supabase/README.md`, `mobile/package.json`'s test chain, `links/generate.mjs`). Line numbers here are at `83d75eb`; if a line has moved, find it by the heading or name cited beside it.
- **Git:** commit and push to the branch freely; end each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. If `git status` shows changes this work didn't make, ask before touching them.

## Shared with the other readiness plans

The roadmap (`docs/superpowers/plans/2026-11-17-asr-0-roadmap.md`) sets the build and merge order. This plan's Tasks 1 to 6 merge into `app-store-readiness` first; Tasks 7 to 9 come last.
- **Produces for plan 2** (`2026-11-17-asr-2-account-deletion.md`, Task 7): `PhoneCodeDeps` without `exchangeTestCode` (Task 3), and later `captchaToken()` (Task 9). Plan 2's `phoneProofDeps` follows the type as it stands when it runs.
- **Shares `supabase/tests/local/bootstrap.sql` with plan 6** (`…-asr-6-retention-and-team-scripts.md`, Task 1): one `auth.identities` stub in the full shape below, made by whichever plan lands first; the other adds nothing to it.
- **Shares `supabase/tests/phone-accounts.sql` with plan 4** (Task 3 deletes its `save_registration_details` block, found by its comment): this plan's Task 5 shifts its line numbers.
- **The link site (`links/`).** Task 4 lands before plans 4 and 5 touch `personal.js` and `personal-flow.mjs`. Plan 5 owns the site's structure (`pageOptions(code, env, mode)`, `generate.mjs`'s build modes and copy list, the page shells); Tasks 7 and 8 build on it, after plan 5 merges.
- **The app.** Plan 3 (`…-asr-3-app-legal-and-content.md`) removes the dead email sign-up (`signUp`) in its Task 8 and owns the licences file and `ios.privacyManifests` (its Tasks 4 and 10); Task 9 runs after plan 3 merges and regenerates both. Plan 2 owns `accountDeletion.ts`; Task 9 finds its Auth calls by name there.

## Decisions this plan makes

1. **An HTTP hook through an Edge Function, not the Postgres hook with `pg_net`.** Supabase's docs (Auth Hooks, read 17 Nov 2026): Postgres hooks have 2 seconds and run inside Auth's transaction; HTTP hooks have 5 seconds, follow Standard Webhooks, and may answer 429 or 503 with `retry-after` to be retried. `net.http_post` only queues a request, so a Postgres hook could never tell Auth that Twilio refused, and the code would sit in `net.http_request_queue` (the weakness already logged for the push secret, `docs/compliance/breach-response.md` section 11); Twilio's keys would live in Vault, and the local harness has no `pg_net`. The Edge Function sees Twilio's answer, keeps the keys as function secrets and is testable under Node.
2. **Our own Standard Webhooks check** (Web Crypto HMAC-SHA256 over `id.timestamp.body`, a 5-minute window, any of several `v1,` signatures, any of several secrets split on `|` for rotation), not the `esm.sh` library: no remote import at deploy time, and testable with the specification's published vector.
3. **Twilio through a Messaging Service with an API key**, not the account's Auth Token: a key is revoked on its own; the Messaging Service gives the UK alphanumeric sender "Resbite" and a fallback sender where needed; `ValidityPeriod=600` means a code that could not be delivered in 10 minutes is never delivered late. Twilio's US region (`api.twilio.com`); the Ireland region is a later change if the owner picks it in the Privacy Policy's placeholder 4.
4. **The text:** `Your Resbite code is 123456. It expires in 10 minutes. Do not share it.` One segment, GSM-7 only (a curly apostrophe would switch the whole message to UCS-2). No domain-bound `@link.resbite.com #123456` line: the code is used in the app too.
5. **What Auth hears back.** Sent: `200 {}`. A number Twilio refuses (codes 21211, 21408, 21610, 21612, 21614): `200` with `{"error":{"http_code":422,"message":"We can’t text this number. Check it, or use another number."}}`, so the words reach the app's and the site's message path. Twilio 429, 5xx, a network error or the 4-second timeout: `503` with `retry-after: 1` (Auth may retry; the person reads "Check your connection and try again."). Anything else (bad keys, a disabled service): `500` with "Text messages aren’t available right now. Try again later.". A malformed event: `200` with `http_code 400` "Invalid code request." (the Postgres hook's words). A bad signature: `401`. Every reply is `Content-Type: application/json`. Whether Auth passes a `200`-with-error body through is reported, not confirmed from source (UNVERIFIED); if it doesn't, the person reads the connection copy, which is safe.
6. **No source-gate constant on `send-sms`.** It acts only on calls Auth signs with the hook secret, and the switch is the dashboard hook. Rollback is pointing the hook back.
7. **Message records are deleted by a daily sweep** (the Privacy Policy's placeholder 5 proposal, `docs/legal/privacy-notice.md:13`): every record that is not in flight and is over 24 hours old, at 03:17 UTC, so "up to 31 days after sending" holds with Twilio's 30-day backups. Not status callbacks: those need the Auth Token to check Twilio's signature, and a lost callback would leave the record for ever. If the owner fills placeholder 5 differently, skip the sweep's schedule step; the route then does nothing.
8. **One sitting, in this order:** the HTTP hook first, a real code proven, then test mode off. Never the reverse: test mode off under the Postgres hook answers 503 to every code request (`supabase/migrations/20261030130000_phone_key.sql:35-37`).
9. **The switch-off is an ops script, not a migration** (`supabase/ops/phone-test-mode-off.sql`): test mode off, `private.test_codes` truncated, every refresh token and session deleted (the method of `qa/phone-accounts-2026-10-27/README.md:98-107`). The before script first checks that the CLI's role may delete from `auth.sessions` and `auth.refresh_tokens`; if not, the sitting stops there.
10. **The review stays in the SQL editor** (`supabase/ops/phone-test-mode-review.sql`, read-only). Its window starts at 28 October 2026 00:00 UTC, the day the phone-accounts migration went live, a superset of the test-mode period. The repo records counts and the decision only; the tester list and the breach log stay outside it.
11. **The retiring migration drops five objects:** `public.exchange_test_code(text,text)`, `public.send_sms_hook(jsonb)`, `private.test_codes`, `private.test_mode_log` and `private.phone_mode`. The scope named three; the hook function and the mode table exist only to serve them, and the HTTP hook replaces the Postgres one. `private.phone_digits` stays (the invitation functions use it). It runs once BR-2026-001 is recorded and the C11 record shows the hook on HTTPS; it does not wait for the new build (Known gaps, 1).
12. **Its rollback never reopens test mode.** It recreates the objects empty, with `private.phone_mode.test_mode` false; reopening is a separate owner decision (Rollout, "Rollback").
13. **Auth settings for paid SMS (C11):** SMS OTP length 6 and expiry 600 seconds (the app's and the site's "6-digit" and their 10-minute `CODE_LIFETIME_MS`), 60 seconds between codes to one number (the app's and site's resend delay), "Rate limit for sending SMS messages" 30 an hour (Supabase's default, `reports/Phone messaging providers.md:39`), phone confirmations on, manual linking on, CAPTCHA off. Twilio side: Geo Permissions limited to the United Kingdom plus any country the owner names, a monthly usage trigger at the D-3 budget, no auto-recharge above it, and SMS pumping protection where the console offers it for Programmable Messaging (UNVERIFIED).
14. **CAPTCHA, vendor-agnostic (blocked):** the link site serves `/captcha`, a page that renders the chosen vendor's widget and posts its token; the app opens it in a WebView sheet (`react-native-webview`, Expo SDK 57: `npx expo install react-native-webview`, recommended 13.16.1, no config plugin); `/r/` and `/i/` render the same widget beside Send code. A fresh token goes with every Auth call that accepts one: `signInWithOtp`, `signInWithPassword`, `resend`, `resetPasswordForEmail`, `signInWithIdToken`, and the site's `POST /auth/v1/otp` (`signUp` is gone from the app once plan 3's Task 8 removes the dead email sign-up; if it is still there when Task 9 runs, it gets the token too). Not `verifyOtp` and not `updateUser` (Supabase's CAPTCHA covers sign-in, sign-up and password reset; which endpoints exactly is UNVERIFIED and settled by the switch-on check). The vendor is two Vercel variables, `CAPTCHA_VENDOR` (`turnstile` or `hcaptcha`) and `CAPTCHA_SITE_KEY`; the app needs only `EXPO_PUBLIC_CAPTCHA_URL`.

## Review Focus

1. **A number Twilio won't text** (a landline, a country outside Geo Permissions, a number that sent STOP). Expected: the app and the site show "We can’t text this number. Check it, or use another number.", not "Check your connection", and nothing is retried. Tests in Tasks 1, 3 and 4.
2. **A call to `send-sms` that Auth didn't sign:** no headers, another secret, a replay older than 5 minutes, a body changed after signing, a GET. Expected: 401 (405 for the GET) and no text sent. Test in Task 1.
3. **Adding a number, and Argentine numbers.** Expected: on Add your number the text goes to `user.new_phone`, never the old `user.phone`; a `549…` number is texted as its stored digits, never folded to the phone key. Test in Task 1.
4. **Twilio slow or down.** Expected: the function gives up after 4 seconds and answers 503 with `retry-after`, inside Auth's 5 seconds; the log holds the outcome and Twilio's code but never the number, the code or the text. Test in Task 1.
5. **Someone types `000000` after live mode,** on the new build, on the current TestFlight build and on `/r/` and `/i/`. Expected: it is checked as typed and refused as any wrong code ("That code doesn’t match. Try again."); the new build and the site never call `exchange_test_code`; on the hosted baseline after the switch-off, `exchange_test_code` returns null and the Postgres hook stores nothing. Tests in Tasks 3, 4 and 5.

---

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `supabase/functions/_shared/sms-hook.ts` (create) | 1, 2 | Signature check, the event's target number, the text, the hook handler, the Twilio sender, the route split |
| `supabase/functions/_shared/sms-hook.test.ts` (create) | 1, 2 | Their tests |
| `supabase/functions/_shared/sms-records.ts` (create) | 2 | The sweep: list Twilio records, delete final ones |
| `supabase/functions/_shared/sms-records.test.ts` (create) | 2 | Its tests, and the schedule script's names |
| `supabase/functions/send-sms/index.ts` (create) | 2 | Wiring from `Deno.env` |
| `supabase/functions/send-sms/README.md` (create) | 2 | Routes, secrets by name, deploy, rollback |
| `supabase/ops/schedule-sms-records-sweep.sql` (create) | 2 | Owner-run cron job `sms-records-sweep` |
| `mobile/src/services/phoneCode.ts`, `phoneFold.ts` and their tests (modify) | 3 | No swap |
| `mobile/scripts/verify-phone.mjs`, `verify-contact-invites.mjs` (modify) | 3 | Fixtures without the exchange |
| `links/assets/personal.js`, `personal-flow.mjs`, `links/personal-flow.test.mjs`, `links/verify-personal.mjs`, `links/verify-open-link.mjs` (modify) | 4 | No swap; the code words pinned |
| `supabase/ops/phone-test-mode-off.sql`, `supabase/ops/phone-test-mode-review.sql` (create) | 5 | The switch-off and the review |
| `supabase/migrations/20261117100000_phone_test_mode_retired.sql`, its rollback, its two rehearsal files, `supabase/tests/phone-test-mode-retired.sql` (create) | 5 | The retirement |
| `supabase/tests/local/bootstrap.sql`, `supabase/tests/phone-accounts.sql`, `supabase/tests/phone-key.sql`, `supabase/tests/hosted-baseline/tests.txt` (modify) | 5 | Harness stubs; retired tests out; the new test listed |
| `qa/phone-codes-2026-11-17/README.md` (create) | 6 | The runbook, the scripts, the C11 record, Applied |
| `qa/app-store-release/README.md`, `qa/phone-accounts-2026-10-27/README.md`, `docs/compliance/breach-response.md`, `supabase/README.md`, `docs/implementation-status.md`, `knowledge-base/08-decisions.md` (modify) | 6 | Pointers and records |
| `links/assets/captcha-vendors.mjs`, `links/assets/captcha.js`, `links/server/lib/captcha.mjs`, `links/server/api/captcha.mjs`, `links/captcha.test.mjs` (create); `links/server/lib/options.mjs`, `links/server/lib/personal.mjs`, `links/generate.mjs` (modify) | 7 | `/captcha` and the CSP |
| `links/assets/personal.js`, `personal-flow.mjs`, their tests and `links/verify-personal.mjs` (modify) | 8 | The site sends the token |
| `mobile/src/services/captcha.ts`, `captcha.test.ts`, `mobile/src/state/CaptchaState.tsx`, `mobile/src/design/CaptchaSheet.tsx`, `mobile/src/domain/captchaCopy.ts` (create); the Auth call sites, `mobile/app/_layout.tsx`, `mobile/package.json`, `mobile/.env.example`, `mobile/src/domain/licences.json` (regenerated), `mobile/app.json` (`ios.privacyManifests`), and the pack's section 6 only if the vendor adds a data type (modify) | 9 | The app sends the token |

---

### Task 1: The Send SMS hook

**Files:**
- Create: `supabase/functions/_shared/sms-hook.ts`, `supabase/functions/_shared/sms-hook.test.ts`

**Interfaces:**
- Consumes: nothing of this plan.
- Produces, in `sms-hook.ts`:
  - `export const SMS_COPY = { invalid: "Invalid code request.", cantText: "We can’t text this number. Check it, or use another number.", unavailable: "Text messages aren’t available right now. Try again later." }`
  - `export const REFUSED_NUMBER_CODES: ReadonlySet<number>` = 21211, 21408, 21610, 21612, 21614.
  - `export type SendResult = { ok: true } | { ok: false; kind: "refused" | "transient" | "config"; status: number; code: number | null }` (`status` 0 for a network error or timeout).
  - `export type LogEntry = { route: "hook" | "sweep"; outcome: string; status?: number; code?: number | null; deleted?: number; kept?: number; failed?: number }`
  - `export type HookDeps = { secrets: string[]; nowSeconds(): number; send(to: string, body: string): Promise<SendResult>; log(entry: LogEntry): void }`
  - `export type TwilioConfig = { accountSid: string; apiKeySid: string; apiKeySecret: string; messagingServiceSid: string; fetch?: typeof fetch }`
  - `export function hookSecrets(raw: string | undefined): string[]`: split on `|`, trimmed, empties dropped.
  - `export async function verifyHookSignature(secrets: string[], headers: Headers, body: string, nowSeconds: number): Promise<boolean>`
  - `export function smsTarget(event: unknown): { to: string; otp: string } | null`
  - `export function smsBody(otp: string): string`
  - `export async function handleSendSms(request: Request, deps: HookDeps): Promise<Response>`
  - `export function twilioSender(c: TwilioConfig): HookDeps["send"]`

- [ ] **Step 1: Write the failing tests** in `sms-hook.test.ts` (node:test and `node:assert/strict`, as `phone-fold.test.ts`). A `signed(body, secret, ts)` helper signs with `node:crypto`'s `createHmac` (independent of the code under test) and returns `Headers` with `webhook-id`, `webhook-timestamp`, `webhook-signature`. Test values: `VECTOR = { secret: "v1,whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", id: "msg_p5jXN8AQM9LWM0D4loKWxJek", ts: 1614265330, body: '{"test": 2432232314}', signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=" }` (the Standard Webhooks specification's vector, recomputed on 17 Nov 2026); `EVENT = { user: { id: "c1000000-0000-4000-8000-000000000001", phone: "447700900834" }, sms: { otp: "123456" } }`.

```ts
test("the Standard Webhooks vector verifies, and only inside five minutes", async () => {
  const h = new Headers({ "webhook-id": VECTOR.id, "webhook-timestamp": String(VECTOR.ts), "webhook-signature": VECTOR.signature });
  assert.equal(await verifyHookSignature([VECTOR.secret], h, VECTOR.body, VECTOR.ts), true);
  assert.equal(await verifyHookSignature([VECTOR.secret], h, VECTOR.body, VECTOR.ts + 300), true);
  assert.equal(await verifyHookSignature([VECTOR.secret], h, VECTOR.body, VECTOR.ts + 301), false);
  assert.equal(await verifyHookSignature([VECTOR.secret], h, VECTOR.body, VECTOR.ts - 301), false);
  assert.equal(await verifyHookSignature([VECTOR.secret], h, '{"test": 2432232315}', VECTOR.ts), false);
});
test("any listed signature and any listed secret will do (rotation)", async () => {
  const h = new Headers({ "webhook-id": VECTOR.id, "webhook-timestamp": String(VECTOR.ts), "webhook-signature": `v1,bad ${VECTOR.signature}` });
  assert.equal(await verifyHookSignature(["v1,whsec_b3RoZXI=", VECTOR.secret], h, VECTOR.body, VECTOR.ts), true);
  assert.deepEqual(hookSecrets(` ${VECTOR.secret} | v1,whsec_b3RoZXI= ||`), [VECTOR.secret, "v1,whsec_b3RoZXI="]);
  assert.deepEqual(hookSecrets(undefined), []);
});
test("the target is the new number when one is being added, as stored digits", () => {
  assert.deepEqual(smsTarget(EVENT), { to: "+447700900834", otp: "123456" });
  assert.deepEqual(smsTarget({ ...EVENT, user: { phone: "+447700900834" } }), { to: "+447700900834", otp: "123456" });
  assert.deepEqual(smsTarget({ user: { phone: "447700900001", new_phone: "+44 7700 900002" }, sms: { otp: "111111" } }), { to: "+447700900002", otp: "111111" });
  assert.deepEqual(smsTarget({ user: { phone: "5491112345678" }, sms: { otp: "123456" } }), { to: "+5491112345678", otp: "123456" });
  for (const bad of [{}, { user: {}, sms: { otp: "123456" } }, { ...EVENT, sms: { otp: "12ab56" } }, { ...EVENT, sms: { otp: "1234567" } }, { user: { phone: "0123" }, sms: { otp: "123456" } }, null, "x"])
    assert.equal(smsTarget(bad), null);
});
test("the text is one GSM-7 segment and says the code, the expiry and not to share it", () => {
  assert.equal(smsBody("123456"), "Your Resbite code is 123456. It expires in 10 minutes. Do not share it.");
  assert.ok(smsBody("123456").length <= 160);
  assert.match(smsBody("123456"), /^[A-Za-z0-9 .]+$/);
});
```

  Handler tests, with `deps({ send?, secrets? })` returning recording `send` and `log` and `nowSeconds: () => TS`:
  - **"a signed event sends one text and answers 200 {}"**: `send` calls deep-equal `[["+447700900834", smsBody("123456")]]`; status 200; `await r.json()` deep-equals `{}`; `content-type` is `application/json`.
  - **"unsigned, wrongly signed, stale or altered: 401 and no text"**: no headers; signed with `"v1,whsec_b3RoZXI="`; signed at `TS - 301`; body changed after signing. Each: status 401, body `{"error":{"http_code":401,"message":"Invalid signature"}}`, `send` never called.
  - **"only POST"**: GET → 405, no text.
  - **"no secret configured: 500 and no text"**: `secrets: []` → 500; `log` saw `outcome: "unconfigured"`.
  - **"a malformed event: 200 with http_code 400 and no text"**: signed `{"sms":{"otp":"12ab56"}}` → 200, body `{"error":{"http_code":400,"message":"Invalid code request."}}`.
  - **"a refused number: 200 with http_code 422 and the words"** (Review Focus 1): `send` → `{ ok: false, kind: "refused", status: 400, code: 21614 }` → 200, `{"error":{"http_code":422,"message":SMS_COPY.cantText}}`; no retry header.
  - **"busy, down or slow: 503 with retry-after"** (Review Focus 4): kinds `transient` with status 429, 503 and 0 → 503, header `retry-after` `"1"`, body `{"error":{"http_code":503,"message":SMS_COPY.unavailable}}`.
  - **"anything else: 500"**: `config` with status 401, code 20003 → 500, body `{"error":{"http_code":500,"message":SMS_COPY.unavailable}}`.
  - **"logs never hold the number, the code or the text"**: after the success, refused, transient and config cases, `JSON.stringify(logged)` contains none of `"7700900834"`, `"123456"`, `"Resbite code"`; the refused entry is `{ route: "hook", outcome: "refused", status: 400, code: 21614 }`.

  `twilioSender` tests with a recording fake `fetch`:
  - **"posts the form to the account's Messages endpoint with the API key"**: one call to `https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json`, method POST, `Authorization` `Basic ${btoa("SKtest:secret")}`, `Content-Type` `application/x-www-form-urlencoded`, and `Object.fromEntries(new URLSearchParams(body))` deep-equals `{ To: "+447700900834", MessagingServiceSid: "MGtest", Body: smsBody("123456"), ValidityPeriod: "600" }`; a 201 reply gives `{ ok: true }`.
  - **"maps Twilio's answers"**: 400 `{"code":21614}` → `{ ok: false, kind: "refused", status: 400, code: 21614 }`; 400 `{"code":21606}` → `config`; 401 `{"code":20003}` → `config`; 429 → `transient`; 503 → `transient`; a non-JSON 500 body → `transient` with `code: null`; a thrown fetch → `{ ok: false, kind: "transient", status: 0, code: null }`.
  - **"gives up after four seconds"**: the fake fetch checks `init.signal` is an `AbortSignal` and the sender passes `AbortSignal.timeout(4000)` (assert by capturing the signal and checking `signal.aborted === false` before resolving; the 4000 is pinned in a named export `TWILIO_TIMEOUT_MS = 4000`).

- [ ] **Step 2: Run** `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/sms-hook.test.ts` → FAIL (`Cannot find module './sms-hook.ts'`).
- [ ] **Step 3: Implement `sms-hook.ts`.** `verifyHookSignature`: needs all three headers and `|nowSeconds - timestamp| <= 300`; for each secret, strip a leading `v1,` then `whsec_`, base64-decode (`atob`), HMAC-SHA256 with `crypto.subtle` over `` `${id}.${timestamp}.${body}` ``, base64 the digest, and compare it in constant time with the part after `v1,` of each space-separated entry of `webhook-signature`. `smsTarget`: digits of `user.new_phone` when non-empty, else of `user.phone`; must match `^[1-9][0-9]{6,14}$`; `otp` must match `^[0-9]{6}$`; `to` is `+` and the digits. `handleSendSms`: read the body once with `request.text()`, then the order the tests pin (method, secrets, signature, parse, send, map). `twilioSender`: `URLSearchParams` body, the result mapping of Decision 5, `REFUSED_NUMBER_CODES` only on a 400.
- [ ] **Step 4: Run** the Step 2 command → PASS, `# fail 0`. Then the whole edge suite (`… --test supabase/functions/_shared/*.test.ts`) → `# fail 0`.
- [ ] **Step 5: Commit:** `git add supabase/functions/_shared/sms-hook.ts supabase/functions/_shared/sms-hook.test.ts` and `git commit -m "Phone codes: the Send SMS hook that texts the code through Twilio"`

### Task 2: The `send-sms` function, the message-record sweep and its schedule

**Files:**
- Create: `supabase/functions/_shared/sms-records.ts`, `supabase/functions/_shared/sms-records.test.ts`, `supabase/functions/send-sms/index.ts`, `supabase/functions/send-sms/README.md`, `supabase/ops/schedule-sms-records-sweep.sql`
- Modify: `supabase/functions/_shared/sms-hook.ts` and its test (add `smsRouter`)

**Interfaces:**
- Consumes: Task 1's `TwilioConfig`, `LogEntry`, `HookDeps`, `handleSendSms`, `twilioSender`, `hookSecrets`.
- Produces:
  - in `sms-hook.ts`: `export function smsRouter(routes: { hook(r: Request): Promise<Response>; sweep(r: Request): Promise<Response> }): (r: Request) => Promise<Response>`: the sweep when the URL's pathname ends with `/sweep`, else the hook.
  - in `sms-records.ts`: `export type SmsRecord = { sid: string; status: string; createdAt: number }`; `export const IN_FLIGHT: ReadonlySet<string>` = queued, sending, accepted, scheduled, receiving; `export const KEEP_MS = 86_400_000`; `export type SweepDeps = { secret?: string; nowMs(): number; list(): Promise<SmsRecord[]>; remove(sid: string): Promise<boolean>; log(entry: LogEntry): void }`; `export async function handleSweep(request: Request, deps: SweepDeps): Promise<Response>`; `export function twilioRecords(c: TwilioConfig): Pick<SweepDeps, "list" | "remove">`.
  - Function secrets, **by name**: `SEND_SMS_HOOK_SECRETS`, `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_MESSAGING_SERVICE_SID`, `SMS_SWEEP_SECRET`. Vault names: `sms_sweep_url`, `sms_sweep_secret`. Cron job: `sms-records-sweep`, `17 3 * * *`.

- [ ] **Step 1: Write the failing tests.** In `sms-hook.test.ts`: **"the router sends /sweep to the sweep and everything else to the hook"**: `https://x.supabase.co/functions/v1/send-sms/sweep` and `https://x.invalid/send-sms/sweep` → sweep; `…/functions/v1/send-sms` and `…/send-sms?x=1` → hook. In `sms-records.test.ts`, with `NOW = Date.parse("2026-11-18T03:17:00Z")`, `SECRET = "s".repeat(32)`, and a request helper with `Authorization: Bearer <secret>`:
  - **"the sweep needs its 32-character bearer secret"**: no header, a wrong secret, and `deps.secret` of 31 characters each → 401 `{"error":"unauthorized"}` and `list` never called; GET → 405.
  - **"deletes settled records over a day old and keeps the rest"**: `list` gives `SM1 delivered NOW-25h`, `SM2 sent NOW-25h`, `SM3 queued NOW-48h`, `SM4 delivered NOW-1h`, `SM5 failed NOW-30h` → `remove` called with `["SM1","SM2","SM5"]`, status 200, body `{"deleted":3,"kept":2,"failed":0}`, one log entry `{ route: "sweep", outcome: "swept", deleted: 3, kept: 2, failed: 0 }`.
  - **"a refused delete is counted and the run goes on"**: `remove("SM1")` → false → `{"deleted":2,"kept":2,"failed":1}`.
  - **"a failed list: 503 and nothing deleted"**: `list` throws → 503 `{"error":"unavailable"}`, `remove` never called.
  - **"twilioRecords pages and deletes with the API key"**: page 1 at `https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json?PageSize=100` returns two messages and `next_page_uri: "/2010-04-01/Accounts/ACtest/Messages.json?PageSize=100&PageToken=PA1"`, page 2 returns one and `next_page_uri: null`; `list()` deep-equals the three as `{ sid, status, createdAt: Date.parse(date_created) }` (RFC 2822 dates such as `"Tue, 17 Nov 2026 10:00:00 +0000"`); with a `next_page_uri` on every page it stops after 10 pages; a non-200 page throws. `remove("SM1")` sends DELETE to `…/Messages/SM1.json` with the Basic key header; 204 → true, 404 → true (already gone), 409 → false.
  - **"the schedule script names its job, its Vault secrets and nothing secret"**: `readFileSync("supabase/ops/schedule-sms-records-sweep.sql", "utf8")` contains `'sms-records-sweep'`, `'17 3 * * *'`, `name = 'sms_sweep_url'`, `name = 'sms_sweep_secret'`, `timeout_milliseconds := 30000`, and matches none of `/whsec_|Bearer [A-Za-z0-9]{20,}|\.supabase\.co\/functions/`.
- [ ] **Step 2: Run** `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/sms-records.test.ts supabase/functions/_shared/sms-hook.test.ts` → FAIL (`Cannot find module './sms-records.ts'`; `smsRouter` not exported).
- [ ] **Step 3: Implement** `smsRouter`, `sms-records.ts` (bearer check as `deliver-notifications/handler.ts:13-21` does, compared in constant time; list everything first, then delete; `fetch` and Basic auth as Task 1's sender), and `send-sms/index.ts`: `declare const Deno` as `fold-phone-account/index.ts:3-6`; a `TwilioConfig` from the four `TWILIO_*` secrets (empty strings when unset, so the sender answers `config`); `Deno.serve(smsRouter({ hook: (r) => handleSendSms(r, { secrets: hookSecrets(Deno.env.get("SEND_SMS_HOOK_SECRETS")), nowSeconds: () => Math.floor(Date.now() / 1000), send: twilioSender(config), log }), sweep: (r) => handleSweep(r, { secret: Deno.env.get("SMS_SWEEP_SECRET"), nowMs: Date.now, ...twilioRecords(config), log }) }))`, where `log` is `(e) => console.log(JSON.stringify({ fn: "send-sms", ...e }))`. Write `supabase/ops/schedule-sms-records-sweep.sql` in the exact shape of `supabase/ops/schedule-deliver-notifications.sql` (header: owner-run, not a migration, not in any test list; prerequisites: the function deployed with `verify_jwt = false`, the two Vault secrets, `sms_sweep_url` = `https://<project-ref>.supabase.co/functions/v1/send-sms/sweep`, `sms_sweep_secret` = the function's `SMS_SWEEP_SECRET`; undo: `select cron.unschedule('sms-records-sweep');`), with the job name, schedule and a 30-second timeout. Write `send-sms/README.md`: what each route does and answers (Decision 5's table), the six secret names, the deploy command `supabase functions deploy send-sms --no-verify-jwt` from the repository root, that `verify_jwt` must read false on the deployed function, what it logs, and the rollback (point the Auth hook back; the sweep's undo).
- [ ] **Step 4: Run** the whole edge suite → `# fail 0`.
- [ ] **Step 5: Commit:** `"Phone codes: the send-sms function, the daily sweep of Twilio's message records and its schedule"`

### Task 3: The app: no more `000000` swap (B12)

**Files:**
- Modify: `mobile/src/services/phoneCode.ts:11,18,65-68,85-89`, `mobile/src/services/phoneCode.test.ts:12-31,66-91,102`, `mobile/src/services/phoneFold.ts:13,54,82-85,144-148`, `mobile/src/services/phoneFold.test.ts:9-24,33-38,43,81`, `mobile/scripts/verify-phone.mjs:1-3,14-15,69-71,98,132-136,153,255-298,397-404,449-454`, `mobile/scripts/verify-contact-invites.mjs:29,178-179,658-686,704,712`

**Interfaces:**
- Produces: `PhoneCodeDeps` without `exchangeTestCode` (keys `signInWithOtp`, `updatePhone`, `verifyOtp`, `now`); `FoldClientDeps` without it (keys `appAccessToken`, `callFold`, `now`, `signInWithOtp`, `verifyOtp`). `verifyPhoneCode` and `foldPhoneAccount` keep their signatures and send the typed code as it is.

- [ ] **Step 1: Write the failing tests.** In `phoneCode.test.ts`, drop the `exchange` option and `calls.exchange` from the harness, delete the four exchange tests (`:66-91`) and `:102`'s exchange line, and add:

```ts
test("000000 is checked as typed, like any other code", async () => {
  const h = harness({ verify: { message: "invalid", status: 403 } });
  assert.deepEqual(await verifyPhoneCode(h.d, phone, "000000", 1_000, "signup"), { ok: false, message: mismatch, clear: true });
  assert.deepEqual(h.calls.verifyOtp, [{ phone, token: "000000", type: "sms" }]);
});
test("nothing can swap a code any more", () => {
  assert.deepEqual(Object.keys(harness().d).sort(), ["now", "signInWithOtp", "updatePhone", "verifyOtp"]);
  assert.equal("exchangeTestCode" in phoneCodeDeps, false);
});
test("a refusal from the text-message hook reaches the screen as written", async () => {
  const words = "We can’t text this number. Check it, or use another number.";
  assert.deepEqual(await sendPhoneCode(harness({ otp: { message: words, status: 422 } }).d, phone, "signup"), { ok: false, message: words });
});
```

  In `phoneFold.test.ts`, drop `exchange` from the harness, replace `:33-38` with **"000000 goes to the isolated verify as typed"** (`foldPhoneAccount(h.d, phone, "000000", 1_000)` → `{ ok: true }`, `h.calls.verify` deep-equals `[{ phone, token: "000000", type: "sms" }]`), delete `:43`, and make `:81`'s key list `["appAccessToken", "callFold", "now", "signInWithOtp", "verifyOtp"]`.
- [ ] **Step 2: Run** `cd mobile && node --import tsx src/services/phoneCode.test.ts && node --import tsx src/services/phoneFold.test.ts` → FAIL (the key lists still hold `exchangeTestCode`; the 000000 verify still goes through the exchange).
- [ ] **Step 3: Implement:** remove `exchangeTestCode` from both deps types and default deps, both `TEST_CODE` constants and both swap lines; `let code` becomes `const code`. Then the browser fixtures:
  - `verify-phone.mjs`: rename `STORED_CODE` to `SENT_CODE` ("the code the text message carried"); remove the `live` flag (`:71`, `:153`) and the `exchange_test_code` route (`:132-136`), so any call to it fails the run as an unplanned request; the "live mode" block (`:261-281`) becomes "000000 is a wrong code" (verify posted with token `000000`, the mismatch copy, no session); every `fill("000000")` that expects a sign-in (`:284`, `:397`, `:449`) types `SENT_CODE`, and the exchange assertions and the "exchange, then verify, then attest" order go (`:290-298`, `:400-404`), leaving the verify-then-attest order; the header (`:1-3`) and the final PASS line stop mentioning test mode.
  - `verify-contact-invites.mjs`: the same rename (`:29`), the route removed (`:178`), the fold's code typed as `SENT_CODE` (`:658`, `:704`, `:712`), the exchange assertions removed and the order check reading `["/auth/v1/verify", "/functions/v1/fold-phone-account"]` (`:661-673`), the PASS text (`:686`) without "000000 is swapped".
  - If plan 2's Task 7 has already merged, its `phoneProofDeps` (`mobile/src/services/accountDeletionFlow.ts`) still provides `exchangeTestCode`: remove that key there too, with its line in `accountDeletionFlow.test.ts`.
  - `git grep -n "exchange_test_code\|exchangeTestCode" -- mobile` prints nothing.
- [ ] **Step 4: Run** `cd mobile && npm test` → every test passes; `npm run typecheck` → exit 0; with Expo web on 8081 (Global Constraints), `node scripts/verify-phone.mjs` and `node scripts/verify-contact-invites.mjs` → their PASS lines, no FAIL.
- [ ] **Step 5: Commit:** `"Phone codes: the app sends the code as typed; the 000000 swap is gone"`

### Task 4: The link site: no more `000000` swap, the code words pinned (D6)

**Files:**
- Modify: `links/assets/personal.js:18,440-449`, `links/assets/personal-flow.mjs:174-175`, `links/personal-flow.test.mjs:24,350-354`, `links/verify-personal.mjs:35,230-232,394-409`, `links/verify-open-link.mjs:31,228-231,437-447,471,512,524`

**Interfaces:**
- Produces: `personal-flow.mjs` without `isTestCode`. The copy is unchanged: once Twilio sends, `confirmBody` ("Type the number {host} invited. We’ll text it a code."), `numberHint` ("We’ll text you a 6-digit code."), `codeSent` and `codeBody` ("We sent a 6-digit code to {number}.") are true, and Decision 13's Auth settings keep "6-digit" and the 10-minute expiry true.

- [ ] **Step 1: Write the failing tests** in `links/personal-flow.test.mjs`: delete the import of `isTestCode` (`:24`) and its test (`:350-354`), and add:

```js
import * as flow from "./assets/personal-flow.mjs";
import { readFileSync } from "node:fs";
test("the page has no test-code path", () => {
  assert.equal("isTestCode" in flow, false);
  const page = readFileSync(new URL("./assets/personal.js", import.meta.url), "utf8");
  assert.ok(!page.includes("exchange_test_code"));
  assert.ok(!page.includes("000000"));
});
test("the code words match the Auth settings: six digits, ten minutes", () => {
  assert.equal(PAGE_COPY.numberHint, "We’ll text you a 6-digit code.");
  assert.equal(PAGE_COPY.confirmBody("Ana"), "Type the number Ana invited. We’ll text it a code.");
  assert.equal(PAGE_COPY.codeBody("+44 7700 900834"), "We sent a 6-digit code to +44 7700 900834.");
  assert.equal(verifyError(400, {}, 0, 599_999), "mismatch");
  assert.equal(verifyError(400, {}, 0, 600_000), "expired");
});
test("a refusal from the text-message hook reaches the page as written", () => {
  const words = "We can’t text this number. Check it, or use another number.";
  assert.equal(sendError(422, { msg: words }), words);
});
```

- [ ] **Step 2: Run** `cd mobile && node --import tsx ../links/personal-flow.test.mjs` → FAIL ("the page has no test-code path").
- [ ] **Step 3: Implement:** remove `isTestCode` (`personal-flow.mjs:174-175`), its import (`personal.js:18`) and the swap (`personal.js:444-449`); `let token` becomes `const token`. Browser fixtures: in both verify scripts rename `STORED_CODE` to `SENT_CODE` and remove the `exchange_test_code` route (any call then fails the run). `verify-personal.mjs:394-409`: after the wrong `111111`, type `000000` (verify posted with token `000000`, the mismatch, the field emptied), then `SENT_CODE` (verified); the verifies list reads tokens `111111`, `000000`, `SENT_CODE`; the exchange assertions go. `verify-open-link.mjs`: `:437` and `:512` type `SENT_CODE`; `:446` goes; the path lists at `:471` and `:524` lose `/rest/v1/rpc/exchange_test_code`. The `noTestCode` checks stay as they are.
- [ ] **Step 4: Run** `cd mobile && npm test` → every test passes; `node --import tsx ../links/verify-personal.mjs` and `node --import tsx ../links/verify-open-link.mjs` → their PASS lines.
- [ ] **Step 5: Commit:** `"Phone codes: the link site sends the code as typed; the 000000 swap is gone"`

### Task 5: The switch-off scripts and the retiring migration

**Files:**
- Create: `supabase/ops/phone-test-mode-off.sql`, `supabase/ops/phone-test-mode-review.sql`, `supabase/migrations/20261117100000_phone_test_mode_retired.sql`, `supabase/rollback/20261117100000_phone_test_mode_retired.rollback.sql`, `supabase/tests/hosted-baseline/20261117100000_phone_test_mode_retired.before.sql`, `supabase/tests/hosted-baseline/20261117100000_phone_test_mode_retired.after.sql`, `supabase/tests/phone-test-mode-retired.sql`
- Modify: `supabase/tests/local/bootstrap.sql` (after `:9`), `supabase/tests/phone-accounts.sql:1-148`, `supabase/tests/phone-key.sql:25-46`, `supabase/tests/hosted-baseline/tests.txt` (append `phone-test-mode-retired.sql` after `open-beta.sql`)

**Interfaces:**
- Consumes: the hosted objects as `20261027120000_phone_accounts.sql` and `20261030130000_phone_key.sql` made them (Global Constraints, with their hashes).
- Produces:
  - `phone-test-mode-off.sql`, plain statements with no `begin`, `commit` or psql meta-command (the owner script wraps it, Rollout step 5): `update private.phone_mode set test_mode = false, changed_at = now();`, `truncate private.test_codes;`, `delete from auth.refresh_tokens;`, `delete from auth.sessions;`, then one `select` of counts only: `test_mode` (`coalesce(…, false)`), `codes_left`, `sessions_left`, `refresh_tokens_left`, `log_rows_kept`. The log is not touched.
  - `phone-test-mode-review.sql`, read-only, for the SQL editor only: (1) per `kind` of `private.test_mode_log`: `rows`, `first_at`, `last_at`; (2) every `exchanged` row with the account's phone and email (the query of `qa/phone-accounts-2026-10-27/README.md:110-114`); (3) every `auth.identities` row created since `timestamptz '2026-10-28 00:00:00+00'` with provider, account phone and email (`:118-122`, with the date fixed, Decision 10). Its header: what each part is for, that its output stays in the SQL editor, and the **Decision rule** of `docs/compliance/breach-response.md` section 11.
  - The migration: `drop function public.exchange_test_code(text, text);`, `drop function public.send_sms_hook(jsonb);`, `drop table private.test_codes;`, `drop table private.test_mode_log;`, `drop table private.phone_mode;`, no `if exists` (on hosted all five exist). Its header names the preconditions its apply script guards (test mode off, no stored code) and those it doesn't (BR-2026-001 recorded; the hook on HTTPS in the C11 record).
  - The rollback: a guard `do` block that raises `'Test mode objects exist: nothing to roll back'` when any of the five exists; then the three tables, their RLS and revokes as `phone_accounts.sql:13-41` made them, except that the mode row is `insert into private.phone_mode(test_mode) values (false);` (Decision 12; the column default stays `true`, so the table's definition matches); then `create function` for both functions with the bodies of `phone_key.sql:26-47` and `:52-74`, and the grants of `phone_accounts.sql:71-72` and `:97-98`.
  - Harness stubs in `bootstrap.sql`: `auth.refresh_tokens(id bigint generated always as identity primary key, user_id text, session_id uuid references auth.sessions(id) on delete cascade, revoked boolean not null default false, created_at timestamptz not null default now())` and, unless plan 6's Task 1 has already made it, `auth.identities` in the one shape both plans use: `(id uuid primary key default gen_random_uuid(), provider_id text, user_id uuid not null references auth.users(id) on delete cascade, identity_data jsonb not null default '{}', provider text not null, last_sign_in_at timestamptz, created_at timestamptz not null default now(), email text)`. If plan 6 has made it, add nothing to it.

- [ ] **Step 1: Write the failing tests.**
  - `supabase/tests/phone-test-mode-retired.sql`, one `begin; … rollback;` block of `do` assertions: `to_regprocedure('public.exchange_test_code(text,text)')` and `to_regprocedure('public.send_sms_hook(jsonb)')` are null; `to_regclass` of `private.test_codes`, `private.test_mode_log` and `private.phone_mode` is null; `private.phone_digits(text)` exists and none of `anon`, `authenticated`, `service_role` may execute it; no function in `public` or `private` has a `pg_get_functiondef` mentioning `exchange_test_code`, `send_sms_hook`, `test_codes`, `test_mode_log` or `phone_mode`.
  - `….before.sql` (prefix `pc_`, ids `ac1d0000-0000-4000-8000-0000000000NN`): (1) `private.pc_rehearsal_functions` with each function's `pg_get_functiondef` and `proacl` (as `20261116120000_open_beta.before.sql:5-11`), and `private.pc_rehearsal_tables` with each table's column fingerprint (the `md5(string_agg(…))` expression of `supabase/ops/hosted-fingerprint.sql`), `relrowsecurity` and `relacl`; (2) fixtures: user 01 with phone `447700900941`, a `test_codes` row for it (otp `123456`, sent now), two log rows (`sent` and `exchanged`, suffix `41`, user 01), an `auth.sessions` row and an `auth.refresh_tokens` row for 01; (3) `\ir ../../ops/phone-test-mode-off.sql`; (4) assertions: `test_mode` false, no `test_codes` row, no session and no refresh token, both log rows kept; as `anon`, `public.exchange_test_code('+44 7700 900941','000000')` is null; as `supabase_auth_admin`, `public.send_sms_hook` on a well-formed event returns `{"error":{"http_code":503,…}}` and stores nothing (Review Focus 5); (5) `\ir ../../ops/phone-test-mode-review.sql` runs, and the log still has its two rows.
  - `….after.sql`: (1) the five objects are gone and `phone_digits` remains; (2) `begin;`, `\ir ../../rollback/20261117100000_phone_test_mode_retired.rollback.sql`, then: each function's definition and grants equal the snapshot, each table's column fingerprint, RLS and ACL equal the snapshot, `private.phone_mode` holds one row with `test_mode` false, and both other tables are empty; then the rollback run a second time, as text through `resbite_repo` in the pattern of `20261111130000_circles_of_trust.after.sql:101-112`, raises exactly `'Test mode objects exist: nothing to roll back'`; `rollback;`; (3) delete the fixtures, drop the two `pc_` tables.
  - Edit the old tests: replace `phone-accounts.sql:1-148` (its test-mode block) with one comment line, "Test-mode codes retired by 20261117100000_phone_test_mode_retired (see phone-test-mode-retired.sql).", and delete `phone-key.sql:25-46` (section 2, whose fixtures nothing later uses), leaving `-- 3.` numbered as it is.
  - Append the stubs to `bootstrap.sql` and the line to `tests.txt`.
- [ ] **Step 2: Run** `bash scripts/test-database-docker.sh` → FAIL at `phone-test-mode-retired.sql` ("exchange_test_code still exists" or similar: the migration isn't written yet).
- [ ] **Step 3: Implement** the two ops scripts, the migration and the rollback, after `sha256sum supabase/migrations/20261027120000_phone_accounts.sql supabase/migrations/20261030130000_phone_key.sql` prints the two hashes in Global Constraints.
- [ ] **Step 4: Run** `bash scripts/test-database-docker.sh` → every line `PASS`, ending `PASS: disposable SQL assertions (full); …`; then `bash scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261117100000_phone_test_mode_retired.sql` → `PASS: 20261117100000_phone_test_mode_retired applies on the hosted baseline`, then every `tests.txt` file `(hosted baseline)` including `phone-test-mode-retired.sql`, ending `PASS: disposable SQL assertions (hosted); …`. Record both PASS counts for Task 6.
- [ ] **Step 5: Commit:** `"Phone codes: the switch-off and review scripts, and the migration that retires test mode"`

### Task 6: The runbook, the Auth settings record and the records

**Files:**
- Create: `qa/phone-codes-2026-11-17/README.md`
- Modify: `qa/app-store-release/README.md` (the **SMS (C1)** line under "Supabase Edge Function secrets", step 11 "Twilio and test mode off", and step 15's "Confirm and record these settings" list); `qa/phone-accounts-2026-10-27/README.md:90` (step 7's first line); `docs/compliance/breach-response.md` section 11 (its **Review** line, which names the runbook); `supabase/README.md:99-103` (the test-mode lines) and a new "Phone codes (send-sms)" section after the phone-key section (`:146-152`); `docs/implementation-status.md` (a dated entry at the top, after `:3`); `knowledge-base/08-decisions.md` (after AS-R9, `:808`)

**Interfaces:**
- Consumes: every file of Tasks 1 to 5 and their PASS counts.
- Produces: the runbook every owner step below follows.

- [ ] **Step 1: Write `qa/phone-codes-2026-11-17/README.md`** with these sections, in the house shape of `qa/chat-release/README.md` (no names, numbers, emails or account ids anywhere):
  - **Header:** spec rows, this plan, the branch and commits, "nothing here is applied" until Applied says otherwise.
  - **What is built:** one paragraph per task, and Decisions 1 to 13 in one line each.
  - **Files and hashes:** the sha256 of `send-sms/index.ts`, `_shared/sms-hook.ts`, `_shared/sms-records.ts`, both ops scripts, `schedule-sms-records-sweep.sql`, the migration and its rollback, from `sha256sum` at the final commit; the two base hashes the rollback copied.
  - **Checks made locally:** Task 5's two PASS counts, the edge suite's count, `npm test`'s count, the four browser checks.
  - **Order, and why the current TestFlight build keeps working:** the section "Order" below, verbatim.
  - **Service texts (F2, F3, F5):** the Privacy Policy (sections 3.1 and 5.2) and `docs/compliance/data-requests.md` section 4 promise texts to accounts with no email (a suspension notice, an identity-check code, a breach warning, an archive password). `send-sms` sends only sign-in codes. The owner sends a service text by hand from Twilio's console, through the same Messaging Service (sender "Resbite"), in GSM-7 words with no apostrophe; the number is typed in the console only and never written in the repo or a `qa/` record; the daily sweep deletes the message record. The request or breach log (outside the repo) records that a text was sent, never the number.
  - **The rollout:** "Rollout (owner-run)" below, with every script block, its expected output and its stop conditions.
  - **Auth settings record (C11):** a table with columns Setting, Where, Value for 1.0, Observed, Date. Rows: Phone provider (on); Enable phone confirmations (on); Send SMS hook (HTTPS, `…/functions/v1/send-sms`; the secret is never written down); SMS OTP length (6); SMS OTP expiry (600 s); interval between codes to one number (60 s); rate limit for sending SMS messages (30 an hour); manual linking (on); Apple provider (on, SI-3); Google provider (on; the Google app published with a verified brand, SI-12); CAPTCHA (off until release runbook step 21; then the vendor's name, never its secret). Twilio rows: account holder (Resbite Ltd), DPA accepted (date), Messaging Service with sender "Resbite", Geo Permissions (country names only), usage trigger (amount), auto-recharge (off or capped), SMS pumping protection (on, or "not offered"), API key (created, date; never its SID). Observed and Date stay empty until the sitting.
  - **Known gaps** (the section below), **Rollback**, **Applied** (empty).
- [ ] **Step 2: Point the old records at it.** `qa/app-store-release/README.md`: the **SMS (C1)** line names the six function secrets and the two Vault names; step 11 keeps its checkboxes but replaces "either the Edge Function … or the Postgres hook body with `pg_net`" with "the `send-sms` Edge Function behind an HTTP Send SMS hook (`qa/phone-codes-2026-11-17/README.md`)" and points the switch-off, the review, the Auth settings, the site deploy and the retiring migration at that runbook's steps; step 15's list says its settings are rows of that runbook's C11 record. `qa/phone-accounts-2026-10-27/README.md:90`: "Superseded on 17 November 2026: run this from `qa/phone-codes-2026-11-17/README.md`, steps 4 to 6." `docs/compliance/breach-response.md` section 11's **Review** line: the review follows `qa/phone-codes-2026-11-17/README.md` steps 5 and 6 and `supabase/ops/phone-test-mode-review.sql`. `supabase/README.md`: the test-mode lines (`:101-103`) say it is switched off at the sitting and retired by `20261117100000`; the new section describes `send-sms` (routes, Decision 5, secrets by name, the sweep and its job) and the retiring migration with its rollback. `docs/implementation-status.md`: "**Phone codes, 17 November 2026:** built on `asr-1-phone-codes` … not live" with the runbook link. `knowledge-base/08-decisions.md`: a subsection "*Phone codes (plan asr-1), 17 November 2026 (assistant's calls; the owner may change them).*" with PC-1 to PC-8: Decisions 1, 3 to 5, 7, 8 and 11 to 13, one line each, no nested bullets.
- [ ] **Step 3: Full check:** `bash scripts/test-database-docker.sh`, the hosted-baseline command of Task 5, `cd mobile && npm run check`, the edge suite → all PASS, and `git grep -n "exchange_test_code" -- mobile links supabase/functions` prints nothing.
- [ ] **Step 4: Commit and push:** `"Phone codes: the rollout runbook, the Auth settings record and the records"`, then `git push -u origin asr-1-phone-codes`.

---

## CAPTCHA (B16, D10): blocked until the owner picks the vendor (AS-D5)

Tasks 7 to 9 start only once AS-D5 names Cloudflare Turnstile or hCaptcha, **and after plans 3 and 5 have merged** (roadmap). Task 7 and 8 extend plan 5's `pageOptions(code, env, mode)`, its `generate.mjs` copy list and rewrites (the `/captcha` route ships in every build mode, `off` included) and its `personalCsp`; the line numbers below are from before plan 5 and are found by name. They are built so that the choice is two Vercel variables. Before Task 7, confirm each vendor's CSP guidance and widget API against its current documentation; the hosts below are as known on 17 November 2026 and are UNVERIFIED until then. They ship in the submission build (release runbook step 20) and are switched on only at step 21.

### Task 7: The `/captcha` page and the vendor table (blocked)

**Files:**
- Create: `links/assets/captcha-vendors.mjs`, `links/assets/captcha.js`, `links/server/lib/captcha.mjs`, `links/server/api/captcha.mjs`, `links/captcha.test.mjs`
- Modify: `links/server/lib/options.mjs:7-19` (two options), `links/server/lib/personal.mjs:7-17` (`personalCsp`), `links/generate.mjs:64` (the copied assets) and `:76-85` (one rewrite), `mobile/package.json` (`"test"`: append `&& node --test ../links/captcha.test.mjs`)

**Interfaces:**
- Produces:
  - `export const CAPTCHA_VENDORS = { turnstile: { name: "Cloudflare Turnstile", script: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", hosts: ["https://challenges.cloudflare.com"], directives: ["script-src", "frame-src"], global: "turnstile" }, hcaptcha: { name: "hCaptcha", script: "https://js.hcaptcha.com/1/api.js?render=explicit", hosts: ["https://hcaptcha.com", "https://*.hcaptcha.com"], directives: ["script-src", "frame-src", "style-src", "connect-src"], global: "hcaptcha" } }`
  - `export function captchaCsp(csp: string, vendor: string): string` in `server/lib/captcha.mjs`: for a known vendor, each of its directives gains its hosts (a directive the policy lacks is added, so `frame-src` is new); for any other value, `csp` unchanged.
  - `pageOptions` gains `captchaVendor` (`env.CAPTCHA_VENDOR` when it names a vendor, else `""`) and `captchaSiteKey` (`env.CAPTCHA_SITE_KEY || ""`); CAPTCHA is on only when both are set.
  - `personalCsp(supabaseUrl, captchaVendor = "")` applies `captchaCsp` after its Supabase host.
  - `export function renderCaptchaPage(options): string` and `captchaHeaders(options)`: `no-store`, `no-referrer`, `noindex`, the strict `PAGE_CSP` widened by `captchaCsp`; a `<div id="captcha" data-vendor data-site-key>` and `<script type="module" src="/captcha.js">`; unconfigured, the text "This check isn’t available." and no vendor host anywhere.
  - `captcha.js` (browser): loads the vendor script, renders the widget explicitly, and posts `{"type":"captcha","token":…}` through `window.ReactNativeWebView.postMessage`, or `{"type":"captcha-error"}` on the vendor's error or expiry callback, or when unconfigured.
  - The rewrite `{ source: "/captcha", destination: "/api/captcha" }`; `captcha.js` and `captcha-vendors.mjs` copied with the other assets.

- [ ] **Step 1: Failing tests** in `links/captcha.test.mjs`: **"each vendor widens only its own directives with only its own hosts"** (for each vendor, `captchaCsp(PAGE_CSP, id)` split into directives differs from `PAGE_CSP` only by that vendor's hosts in that vendor's directives; `captchaCsp(PAGE_CSP, "other") === PAGE_CSP`); **"the options read the two variables and ignore an unknown vendor"**; **"the page carries the widget's inputs and its script, and nothing when unconfigured"**; **"personalCsp keeps the Supabase host and adds the vendor's"**; **"generate() serves /captcha and ships its files"** (the generated `vercel.json` has the rewrite; the output folder has `captcha.js` and `captcha-vendors.mjs`).
- [ ] **Step 2: Run** `cd mobile && node --test ../links/captcha.test.mjs` → FAIL (module not found).
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `cd mobile && npm test` → all pass (`links/page.test.mjs:60`'s "no third-party resources" still holds: no vendor is set there).
- [ ] **Step 5: Commit:** `"CAPTCHA: the /captcha page and the vendor table, off until the vendor is set"`

### Task 8: `/r/` and `/i/` send the token (blocked)

**Files:**
- Modify: `links/assets/personal-flow.mjs` (`PAGE_COPY`, a new `otpBody`), `links/assets/personal.js:425-428` (`sendCode`) and the number step it builds, `links/server/lib/personal.mjs` (`stepsBody` data attributes; both renderers pass `options.captchaVendor`), `links/personal-flow.test.mjs`, `links/personal.test.mjs`, `links/verify-personal.mjs`

**Interfaces:**
- Consumes: Task 7's `CAPTCHA_VENDORS`, `pageOptions`, `personalCsp`.
- Produces: `export function otpBody(phone: string, token: string | null): object` → `{ phone, create_user: true }`, plus `gotrue_meta_security: { captcha_token: token }` when `token`; `PAGE_COPY.captchaNote: (name) => \`We use ${name} to check you’re not a bot.\`` (the wording of `docs/legal/invitee-notice-short.md:44`), shown beside Send code; the page's `data-captcha-vendor` and `data-captcha-site-key` attributes only when both options are set.

- [ ] **Step 1: Failing tests:** `otpBody` with and without a token (exact objects); `captchaNote("hCaptcha")` exact; the open page and the personal page carry the two attributes and the widened CSP only with both options set (`personal.test.mjs`); `verify-personal.mjs` gains a run with `CAPTCHA_VENDOR=turnstile` and a site key, whose fixture answers the vendor's script URL with a stub defining `window.turnstile` (`render` calls back `"stub-token"`), and asserts each `/auth/v1/otp` body has `gotrue_meta_security.captcha_token === "stub-token"` and each resend gets a fresh render.
- [ ] **Step 2: Run** `cd mobile && node --import tsx ../links/personal-flow.test.mjs && node --test ../links/personal.test.mjs` → FAIL.
- [ ] **Step 3: Implement:** `sendCode` asks the widget for a token before each `POST /auth/v1/otp` (send and resend) and resets it after; a failed or expired widget shows `C.connection` and sends nothing.
- [ ] **Step 4: Run** `cd mobile && npm test` and both link verify scripts → PASS.
- [ ] **Step 5: Commit:** `"CAPTCHA: the link pages send the token with every code request"`

### Task 9: The app sends the token (blocked)

**Files:**
- Create: `mobile/src/services/captcha.ts`, `mobile/src/services/captcha.test.ts`, `mobile/src/state/CaptchaState.tsx`, `mobile/src/design/CaptchaSheet.tsx`, `mobile/src/domain/captchaCopy.ts`
- Modify: `mobile/package.json` (`react-native-webview` via `npx expo install react-native-webview`; the test chain gains `&& node --import tsx src/services/captcha.test.ts`), `mobile/.env.example` (a commented `EXPO_PUBLIC_CAPTCHA_URL=` with one line on it), `mobile/app/_layout.tsx:39-46` (`CaptchaProvider` inside `SafeAreaProvider`), `mobile/src/services/phoneCode.ts:7-13,33-55`, `mobile/src/services/phoneFold.ts:8-19,58-74`, `mobile/src/state/useAuthFlow.ts` (its `signInWithPassword`, `resend` and `resetPasswordForEmail` calls, found by name: plan 3's Task 8 rewrites this file and removes `signUp`), `mobile/src/services/appleSignIn.ts:14,49,74-76`, `mobile/src/services/accountDeletion.ts` (plan 2 rewrites it; find its `signInWithOtp`, `signInWithPassword` and `signInWithIdToken` calls by name), `mobile/src/domain/licences.json` (regenerated) and `mobile/app.json` (`ios.privacyManifests`, plan 3's Task 10), `mobile/src/domain/privacyCopy.ts` and `privacyCopy.test.ts` (plan 3's Task 6: the vendor named), `qa/app-store-release/app-store-connect-pack.md` section 6 (only if the vendor's disclosure adds a data type), and their tests

**Interfaces:**
- Consumes: Task 7's `/captcha` page and its message shapes.
- Produces:
  - `captcha.ts`: `export function captchaUrl(env = process.env): string | null` (`EXPO_PUBLIC_CAPTCHA_URL` when it parses as an `https:` URL); `export function parseCaptchaMessage(data: string): { token: string } | { error: true } | null` (a token is a non-empty string of at most 4,096 characters); `export function withCaptcha<T extends object>(options: T, token: string | null): T & { captchaToken?: string }`; `export class CaptchaCancelled extends Error {}`; `export function setCaptchaRequester(fn: ((url: string) => Promise<string>) | null): void`; `export async function captchaToken(env = process.env): Promise<string | null>` (null with no URL; the requester's token otherwise; throws when a URL is set and no requester is mounted).
  - `CaptchaState.tsx`: `export function CaptchaProvider({ children }: { children: React.ReactNode })`, which registers the requester while mounted and shows `CaptchaSheet` while a request is open: a `WebView` of the URL, top-level navigation held to that origin, the token on a valid message, `CaptchaCancelled` on Close, an `Error` after 120 seconds or on `captcha-error`.
  - `captchaCopy.ts`: `CAPTCHA_COPY = { heading: "Quick check", close: "Close", failed: "The check didn’t load. Check your connection and try again." }`; `PHONE_CODE_COPY.check = "Finish the quick check to get your code."`.
  - `PhoneCodeDeps` and `FoldClientDeps` gain `captchaToken(): Promise<string | null>`; `signInWithOtp`'s `options` gain `captchaToken?: string`. Sign-up and sign-in sends (and the fold's send) ask for a fresh token before each send; Add your number (`updatePhone`) and every `verifyOtp` don't (Decision 14).

- [ ] **Step 1: Failing tests:** `captcha.test.ts`: **"the URL must be https"**, **"messages are parsed strictly"** (valid token; `captcha-error`; wrong type, empty or 4,097-character token, non-JSON → null), **"withCaptcha adds the token only when there is one"**, **"no URL, no token; a URL without a requester throws"**. `phoneCode.test.ts`: **"sign-up and sign-in sends carry a fresh token; Add your number doesn't"** (two sends call `captchaToken` twice and pass `captchaToken: "t1"`, then `"t2"`; `add` calls it zero times); **"a closed check sends nothing and says why"** (`captchaToken` throws `CaptchaCancelled` → `{ ok: false, message: PHONE_CODE_COPY.check }`, no `signInWithOtp` call); **"a check that fails to load reads as a connection problem"**. `phoneFold.test.ts`: the fold's send carries the token. The other call sites get one test each that the token reaches the call's `options.captchaToken`.
- [ ] **Step 2: Run** `cd mobile && node --import tsx src/services/captcha.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement**, after `npx expo install react-native-webview` in `mobile/` (it records the SDK 57 version, 13.16.1). Then, because plan 3's drift and required-reason tests now fail on purpose (its Review Focus 3): run `node --import tsx scripts/generate-licences.mjs` and commit `src/domain/licences.json`; add to `ios.privacyManifests.NSPrivacyAccessedAPITypes` every (category, reason) pair the new package's `PrivacyInfo.xcprivacy` declares; and check the vendor's own privacy disclosure against the App Privacy table (pack section 6, spec E3's last row: data collected by third-party code counts). If it adds a data type, add the row to the pack and the manifest together (plan 3's `appConfig.test.ts` keeps them equal). Name the vendor in Data & privacy's "Who we work with" topic too: plan 3's `PRIVACY_TOPICS` `vendors` paragraph in `mobile/src/domain/privacyCopy.ts` gains "<vendor name> checks that sign-ins aren’t from bots." after the Twilio sentence, with its test in `privacyCopy.test.ts`.
- [ ] **Step 4: Run** `cd mobile && npm run check` → PASS (plan 3's licence and manifest tests included); `node scripts/verify-phone.mjs` with `EXPO_PUBLIC_CAPTCHA_URL` unset → PASS (no sheet, no token).
- [ ] **Step 5: Commit:** `"CAPTCHA: the app asks for a fresh token before each Auth call that takes one"`

---

## Order (why the current TestFlight build keeps working)

- **The hook switch** changes nothing the build sees: it still calls `signInWithOtp`, and the code now arrives by text. A typed real code verifies as before.
- **Test mode off:** the build's swap runs only on a typed `000000` (`mobile/src/services/phoneCode.ts:68`); `exchange_test_code` then returns null, the build verifies `000000` as typed, and Auth refuses it as a wrong code. Real codes are untouched. The fold's send and verify (`phoneFold.ts:63`, `:85-86`) behave the same.
- **Every session ends:** the build's next refresh fails, it signs out, and the person signs in again by text code, Apple, Google or password. Web pages ask to confirm the number again (`personal.js`'s `freshSession`, "signedOut").
- **The site deploy** is independent of the build.
- **The retiring migration:** the build calls `exchange_test_code` only on a typed `000000`, which then answers 404 and reads "Check your connection and try again." (Known gaps, 1). Real codes are untouched.
- **CAPTCHA stays off** throughout. Switching it on later locks out builds without Task 9, so release runbook steps 20 and 21 put it after the new build.

## Rollout (owner-run)

Every step needs the owner's approval at the time. Each script is written into the home directory from its block in `qa/phone-codes-2026-11-17/README.md` (with the final hashes filled in), read by the owner, and run with `! bash ~/<name>.sh`. Each runs from `${REPO:-$HOME/dev/resbite-app}` at the merged commit, and none prints a secret, a number or an account id. The advisors are read through the Supabase MCP server once the owner approves.

**Before the sitting (owner, no Supabase change):**
- Tasks 1, 2, 4 and 5 merged where the rollout runs from (the owner's choice). Task 3 rides the next build.
- Twilio: an account in Resbite Ltd's name; the DPA accepted and recorded in `docs/compliance/vendors.md` (F7); a Messaging Service with the alphanumeric sender "Resbite" (and a sender number only if a permitted country needs one); Geo Permissions, usage trigger, auto-recharge and pumping protection as Decision 13; an API key. Values are typed only into `~/pc-secrets.sh`.
- BR-2026-001 opened in the breach log, outside the repo (`docs/compliance/breach-response.md` section 11).

**Sitting 1: SMS on, test mode off (release runbook step 11).**

1. **Before snapshot and checks**, `~/pc-before.sh` (read-only):
   ```bash
   #!/bin/bash
   # Read-only: the before snapshot and what the switch-off needs (phone codes, step 1).
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   D=qa/phone-codes-2026-11-17
   supabase db query --linked -f supabase/ops/hosted-fingerprint.sql -o json > "$D/hosted-before.json"
   supabase db query --linked -f supabase/ops/hosted-counts.sql -o json > "$D/hosted-counts-before.json"
   supabase db query --linked "select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations"
   supabase db query --linked "select (select test_mode from private.phone_mode) as test_mode, (select count(*) from private.test_codes) as stored_codes, (select count(*) from private.test_mode_log) as log_rows, has_table_privilege(current_user, 'auth.sessions', 'delete') as may_end_sessions, has_table_privilege(current_user, 'auth.refresh_tokens', 'delete') as may_end_refresh_tokens"
   supabase db query --linked "select jobname from cron.job order by jobname"
   ```
   Expected: `25 | 20261116120000` (or the count and latest another AS sitting recorded first); `test_mode` true; both `may_end_*` true, **otherwise stop**; no `sms-records-sweep` job. The fingerprint matches a local replay of `migrations.txt` (the known `acl` differences only).
2. **[approval: both function files by sha256]** Deploy, `~/pc-deploy.sh`:
   ```bash
   #!/bin/bash
   # Deploy send-sms (phone codes, step 2). Only after the owner approves the three files by name and sha256.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   sha256sum -c - <<EOF
   <sha256>  supabase/functions/send-sms/index.ts
   <sha256>  supabase/functions/_shared/sms-hook.ts
   <sha256>  supabase/functions/_shared/sms-records.ts
   EOF
   REF="$(cat supabase/.temp/project-ref)"
   supabase functions deploy send-sms --no-verify-jwt --project-ref "$REF"
   curl -s -X POST -H 'Content-Type: application/json' -d '{}' "https://$REF.supabase.co/functions/v1/send-sms"; echo
   curl -s -X POST "https://$REF.supabase.co/functions/v1/send-sms/sweep"; echo
   ```
   Expected: `{"error":{"http_code":401,"message":"Invalid signature"}}` and `{"error":"unauthorized"}` (the function's own answers, so JWT checking is off and both routes refuse strangers). In the dashboard, the function's JWT verification reads off.
3. **[approval]** Dashboard → Authentication → Hooks → Send SMS: type HTTPS, URL `https://<project-ref>.supabase.co/functions/v1/send-sms`, generate the secret and copy it. Then `~/pc-secrets.sh`:
   ```bash
   #!/bin/bash
   # The send-sms secrets (phone codes, step 3). Prompts for each value; prints names only.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   umask 077; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
   ask() { local v; read -rsp "$1: " v; echo >&2; [ -n "$v" ] || { echo "$1 is empty" >&2; exit 1; }; printf '%s=%s\n' "$1" "$v" >> "$T/env"; }
   for n in SEND_SMS_HOOK_SECRETS TWILIO_ACCOUNT_SID TWILIO_API_KEY_SID TWILIO_API_KEY_SECRET TWILIO_MESSAGING_SERVICE_SID SMS_SWEEP_SECRET; do ask "$n"; done
   grep -q '^SEND_SMS_HOOK_SECRETS=v1,whsec_' "$T/env" || { echo "The hook secret must start v1,whsec_" >&2; exit 1; }
   [ "$(grep '^SMS_SWEEP_SECRET=' "$T/env" | cut -d= -f2- | tr -d '\n' | wc -c)" -ge 32 ] || { echo "SMS_SWEEP_SECRET needs 32 characters or more" >&2; exit 1; }
   REF="$(cat supabase/.temp/project-ref)"
   supabase secrets set --env-file "$T/env" --project-ref "$REF"
   supabase secrets list --project-ref "$REF" | cut -d'|' -f1
   ```
   The owner generates `SMS_SWEEP_SECRET` in their password manager and keeps it for step 11. Then save the hook. (If the dashboard shows the secret only after saving, save, then run the script at once; codes fail for that minute.)
4. **Prove a real code** on the current TestFlight build with the owner's own number: sign out, sign in by number, a text from "Resbite" arrives with "Your Resbite code is …", the code signs in. **If no text arrives:** point the hook back to Postgres `public.send_sms_hook` (test mode is still on; nothing else changed), read the function's log lines (outcome and Twilio code), stop.
5. **[approval: by sha256]** Test mode off, `~/pc-test-mode-off.sh`:
   ```bash
   #!/bin/bash
   # Test mode off, the stored codes emptied, every session ended (phone codes, step 5). Only after step 4 passed.
   set -euo pipefail
   cd "${REPO:-$HOME/dev/resbite-app}"
   F=supabase/ops/phone-test-mode-off.sql
   echo "<sha256>  $F" | sha256sum -c -
   GUARD="if pg_catalog.to_regclass('private.test_codes') is null then raise exception 'Test mode is already retired'; end if;
    if not coalesce((select test_mode from private.phone_mode), false) and not exists (select 1 from private.test_codes) then raise exception 'Test mode is already off'; end if;"
   mkdir -p /tmp/pc
   { echo 'begin;'; echo "do \$\$ begin $GUARD end \$\$;"; cat "$F"; echo; echo 'commit;'; } > /tmp/pc/off.sql
   supabase db query --linked -f /tmp/pc/off.sql
   supabase db query --linked "select coalesce((select test_mode from private.phone_mode), false) as test_mode, (select count(*) from private.test_codes) as stored_codes, (select count(*) from private.test_mode_log) as log_rows"
   ```
   Expected: `test_mode` false, `stored_codes` 0, `log_rows` as in step 1. Everyone is signed out within the hour (access tokens run to expiry).
6. **The review, in the SQL editor:** paste `supabase/ops/phone-test-mode-review.sql` (its sha256 recorded), compare every row with the tester list kept outside the repo, and complete BR-2026-001 by its decision rule. If any row is not a known tester's, the 72-hour clock runs from that moment (`docs/compliance/breach-response.md` sections 5 and 6). The README records only: rows reviewed, matched, unmatched; identities reviewed, matched, unmatched; the decision.
7. **[approval]** Auth settings and Twilio settings as Decision 13; fill Observed and Date in the C11 record. CAPTCHA stays off.
8. **[approval: Vercel]** Deploy the link site from this plan's own commit (the `asr-1-phone-codes` head, whose `links/` is the live site plus Task 4 only), as `qa/contact-invites-2026-10-28/README.md:58` did (generate, link, delete `.env.local`, preview, then production). Never from a later `app-store-readiness` head: it may carry plan 4's new tick wording and `TERMS_VERSION` fallback or plan 5's pages, which must not go live before the documents are published (plan 5, R0). If plan 5's `generate.mjs` is in the commit after all, build with `--legal=off` and confirm on the preview that the tick reads as on the live site. On the preview, `curl -s <preview>/personal.js | grep -c exchange_test_code` prints `0`. Record both deployment ids (the previous one is the rollback). Add the Vercel firewall rate limit on `/i/*` beside `/r/*` (D5).
9. **Prove it on the web and refuse `000000`:** a real code on an open `/r/` link of a test resbite; `000000` refused on the app and the site.
10. **After snapshot**, `~/pc-after.sh` (read-only): the fingerprint and counts into `hosted-after.json` and `hosted-counts-after.json`. Expected: the fingerprint equals step 1's (no schema change); `private.test_codes` 0; other counts differ only by live use. Advisors: unchanged.
11. **[approval: by sha256] The sweep's schedule.** Dashboard → Vault: `sms_sweep_url` (`https://<project-ref>.supabase.co/functions/v1/send-sms/sweep`) and `sms_sweep_secret` (step 3's value). Then `~/pc-sweep-schedule.sh`: hash check of `supabase/ops/schedule-sms-records-sweep.sql`; `select count(*) from vault.secrets where name in ('sms_sweep_url','sms_sweep_secret')` must print 2, else stop; run the file with `supabase db query --linked -f`; `select jobname, schedule from cron.job where jobname = 'sms-records-sweep'` prints `sms-records-sweep | 17 3 * * *`. The next day, `cron.job_run_details` shows a succeeded run and the function's log a `swept` line. Skip this step if the owner fills the Privacy Policy's placeholder 5 another way (Decision 7).
12. Record each step under Applied, with dates and counts only.

**Sitting 2: retire test mode (once BR-2026-001 is complete and the C11 record shows the HTTPS hook).**

13. **[approval: by name and sha256]** `~/pc-retire-apply.sh`, in `ch1-apply.sh`'s shape (`qa/chat-release/README.md:430-452`): hash check of `supabase/migrations/20261117100000_phone_test_mode_retired.sql`; before snapshots into `hosted-before-retired.json` and `hosted-counts-before-retired.json`; a guard raising `'Test mode is already retired'` when `private.test_codes` is gone, `'Test mode is still on: run the switch-off first'` when `test_mode` is true, `'Stored codes remain: run the switch-off first'` when a code is stored, and `'A later migration is applied: rename this file first'` when `supabase_migrations.schema_migrations` holds a version above `20261117100000` (the roadmap's order; Global Constraints); `begin;`, guard, file, `commit;` through `supabase db query --linked -f`; `supabase migration repair --status applied 20261117100000 --linked --yes`; the history line; after snapshots into `hosted-after-retired.json` and `hosted-counts-after-retired.json`. If only the repair failed, run it alone, then the history and the after snapshots.
14. **Compare and record:** the after fingerprint equals a local replay of `migrations.txt` plus the candidate (the five objects gone, nothing else). Advisors: the WARN on `public.exchange_test_code` and the INFO lines on the three tables are gone. Append `20261117100000_phone_test_mode_retired.sql   20261117100000` to `supabase/tests/hosted-baseline/migrations.txt`; run `bash scripts/test-database-docker.sh --hosted-baseline` with the still-pending AS candidates only → PASS. A real code still signs in on the app.

**Sitting 3: CAPTCHA on (release runbook step 21; after Tasks 7 to 9, the step 20 build and the testers' update).**

15. **[approval: Vercel]** Set `CAPTCHA_VENDOR` and `CAPTCHA_SITE_KEY` (a site key allowed for `link.resbite.com`) and deploy; `/captcha` shows the widget; `/r/` and `/i/` show it beside Send code. **[approval: EAS]** `EXPO_PUBLIC_CAPTCHA_URL=https://link.resbite.com/captcha` was set before the step 20 build.
16. **[approval: Supabase]** Auth → CAPTCHA on, the vendor and its secret key. Check at once: phone sign-up and sign-in, Add your number, email sign-up, password sign-in, password reset, Apple, Google, the fold, and `/r/` and `/i/`. Any path refused: switch CAPTCHA off (instant), record which path, and add the token there. Record the result in the C11 record.

**Rollback.**
- **Before step 5:** point the Auth hook back to Postgres `public.send_sms_hook`. Nothing else changed.
- **After step 5,** test mode is off for good: a Twilio failure means fixing Twilio (keys, Geo Permissions, balance). Reopening test mode (the hook back to Postgres and `update private.phone_mode set test_mode = true`) reopens SI-1's hole for everyone and needs a new breach-log note; it is the owner's decision, not a rollback step.
- **The site:** promote the previous production deployment.
- **The sweep:** `select cron.unschedule('sms-records-sweep');`.
- **The retiring migration:** `~/pc-retire-rollback.sh`, in `ch3-rollback.sh`'s shape (`qa/chat-release/README.md:892-906`): hash check of the rollback, `begin;`/`commit;` through `supabase db query --linked -f`, then a fingerprint into `hosted-after-rollback-retired.json`, which must equal `hosted-before-retired.json` except the mode row's value. Remove the line from `migrations.txt`; the history row stays. Test mode stays off.
- **CAPTCHA:** switch it off in Auth.

## Known gaps

1. After the retiring migration, a build older than Task 3 shows "Check your connection and try again." when someone types `000000`, and in the one-in-a-million case where a real code is `000000` it fails that attempt; "Send a new code" fixes it.
2. Whether Auth passes the hook's `200`-with-`http_code 422` words through to the client is UNVERIFIED (Decision 5). If it doesn't, a refused number reads as a connection problem.
3. A lost day's sweep leaves records until the next run; a run caps at 1,000 records.
4. Tokens issued before step 5 keep working until they expire (an hour by default); they can't be refreshed.
5. Which Auth endpoints Supabase's CAPTCHA covers is UNVERIFIED until step 16.
6. Twilio's SMS pumping protection for Programmable Messaging, and whether Geo Permissions must include countries of existing testers, are the owner's to confirm in the console.

## Self-review (17 November 2026)

- **Spec coverage:** C1 (Tasks 1, 2 and 5; sitting 1), SI-1 (all), B12 (Task 3), D6 and WEB-4 (Task 4; step 8), F5 (step 6), the switch-off of `qa/phone-accounts-2026-10-27/README.md:90-122` (Task 5; steps 5 and 6), PRV-7's test codes (step 5; sitting 2), the drop (Task 5; sitting 2), the secrets by name (Task 2; step 3), C11's record (Task 6; step 7), OPS-5 and F14's SMS limit and D5's `/i/*` rule (steps 7 and 8), OPS-9, B16 and D10 (Tasks 7 to 9; sitting 3, blocked), and the Privacy Policy's placeholder 5 (Task 2; step 11).
- **Step scan:** every code step names its file, its exports and the values the decisions pin; every test step names its tests and assertions; the scripts are the runbook's deliverables.
- **Names:** `SMS_COPY.cantText` is the one string in Tasks 1, 3 and 4; `smsRouter`, `handleSendSms`, `handleSweep`, `twilioSender`, `twilioRecords` and the six secret names are defined once (Tasks 1 and 2) and used as defined in the rollout; `SENT_CODE` replaces `STORED_CODE` in all four verify scripts.
- **Review Focus:** each of the five lines has its test in the task named.
