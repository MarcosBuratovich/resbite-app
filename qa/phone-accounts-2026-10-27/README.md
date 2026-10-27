# Phone accounts: build and rollout runbook (27 October 2026)

- **Spec:** [Contact invitations design](../../docs/superpowers/specs/2026-10-27-contact-invitations-design.md), agreed with the owner on 27 October with decisions CI-D1 to CI-D13 and the accepted proposals CI-P1 to CI-P13. Phone accounts are plan 1 of 4.
- **Plan:** [Phone accounts plan](../../docs/superpowers/plans/2026-10-27-phone-accounts.md).
- **Code:** branch `contact-invitations`, commits `afd5dd2` to `7fe57ad` (Tasks 1 to 10), on top of the spec (`d730b00`) and the plan (`9073afc`). **Nothing is applied to the hosted project, the Auth dashboard, EAS or TestFlight.** This directory will hold the hosted before/after snapshots when the migration is applied.

## What is built

- **Database (one hosted-compatible migration):** the Send SMS hook (`public.send_sms_hook`) stores the code instead of sending it, and `public.exchange_test_code` swaps the fixed code 000000 for the stored one while test mode is on (`private.phone_mode`). A confirmed phone now counts as a confirmed account for access, a maintainer grant exists, the app records "has used the app" and the 18+ tick stands on its own. A roster match needs a confirmed email.
- **App:** sign-up and sign-in by phone number and code, "Add your number" for accounts without one (it gates the rest of the app), "About you" for accounts without a name, and Apple and Google linked to the signed-in account to fill the name. Email and password stay for existing accounts.

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261027120000_phone_accounts.sql` | `c2f39f7e20fa4ccf39bc9a72a8081dc758118db257e6e27b7debc67651a3bf13` |
| `supabase/rollback/20261027120000_phone_accounts.rollback.sql` | `a0826a92590d90c5f7ee50f08959de3792d88e1f29dd97826ebea3771261b266` |
| `supabase/migrations/20261022120001_gi2_local_delivery_and_deletion.sql` (local-only GI2 companion), now | `f48b5ca74e8b7460f413ed76e9bd85113cc88e6a462af4cb73aa7f665a01aba5` |
| the same, before this work | `0bbcba8e6eab16491fb1a2eec7fb5551b4af9723d66a6a58ac07ab2ebb671e5a` |
| its rollback, now | `4d5db49ad841c53f996ee76ddee07bce5414bf1c4237fa1e6531d71e4b6888e1` |
| the same, before this work | `df7a68fba12885049103b3a5c833358b8ea18d935055f261c8a71bb8bb86ed81` |

The companion changed so that its `user_eligible` body matches the new hosted body: a confirmed email or phone counts, and a roster match needs a confirmed email. Its rollback changed in the header only. The GI2 section of `docs/implementation-status.md` quotes the old values; this table supersedes them.

## Final local checks (at the task 11 commit's parent, `7fe57ad`)

- `cd mobile && npm run check`: exit 0. The type check is clean and the unit tests report 382 tests passing, 0 failing, across 55 test files.
- `./scripts/test-database-docker.sh` (Docker `postgres:17`, full mode): 26 `PASS` lines, ending `PASS: disposable SQL assertions (full); synthetic roster empty. Auth/Storage HTTP integration is separate.`
- `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261027120000_phone_accounts.sql`: 14 `PASS` lines including `phone-accounts.sql (hosted baseline)`, ending `PASS: disposable SQL assertions (hosted); synthetic roster empty. Auth/Storage HTTP integration is separate.`
- Worker tests: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`: 59 of 59 pass. (This machine's Node lacks TypeScript stripping, hence tsx.)
- Browser QA: Expo web started with `EXPO_PUBLIC_SUPABASE_URL=https://ewcsgvhuojxdpaspwsrx.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=qa-fixture-key`, with every request intercepted. `verify-phone.mjs` covers sign-up, sign-in, Add your number, a taken number, 000000 refused in live mode and Sign out at the gate; the new screens are captured by `review-ui`.

## Rollout runbook

None of these steps has been run. Each is done later, with the owner's approval.

1. **Migration.**
   - The owner approves by file name and sha256 of `20261027120000_phone_accounts.sql`.
   - Take hosted before/after snapshots into this directory.
   - Apply it, then run the advisors.
   - Append the line to `supabase/tests/hosted-baseline/migrations.txt` with its hosted version.
2. **Auth dashboard.**
   - Phone provider on.
   - Hooks, Send SMS, Postgres, `public.send_sms_hook`.
   - SMS OTP length 6 and expiry 600 seconds.
   - Raise the SMS-sent rate limit for testing.
   - "Allow manual linking" on. Native Apple id-token linking needs this; check it on the iPhone in step 4.
   - Check that phone sign-in works with the hook standing in for a provider. If Supabase still demands a provider, note what it asks for and stop.
   - Prove the real path once:
     1. Add one Supabase test number (dashboard "Test phone numbers", fixed code).
     2. Briefly set `test_mode = false`.
     3. Sign in with that number and its fixed code.
     4. Set `test_mode = true` again and remove the test number.
3. **Grant access to test phone accounts.**

   ```sql
   insert into private.beta_access(user_id, source) values (:user_id, 'maintainer') on conflict (user_id) do nothing;
   ```

   Test numbers come from `+44 7700 900000` to `900999`.
4. **Build.** A TestFlight build from `contact-invitations`, then the owner's iPhone check:
   - sign up with a test number and 000000;
   - About you with Apple, then with Google on a second account (this proves native Apple linking);
   - sign out and sign in by number;
   - the owner's own account gets Add your number;
   - a taken number is refused;
   - Larger Text and VoiceOver on the four new screens.
5. **Known limit, until Plan 2's account folding.** Someone who creates a phone account by mistake while already having an Apple, Google or email account gets "already has a Resbite account" when About you links Apple or Google, whether that Apple ID or Google account, or only its email, belongs to the other account. Their number is then held by the new, empty account. The owner removes that empty user in the dashboard.
6. **Not live with this plan.**
   - Local-only checks still read `email_confirmed_at`: notification recipients, deletion requests and intents.
   - Plan 4 (push) and the deletion milestone must widen them before phone-only accounts get notices or can delete.
   - `join_by_link` (GI2, hosted) still requires a confirmed email. Plan 3 replaces it.
7. **Turning test mode off later.**

   ```sql
   update private.phone_mode set test_mode = false, changed_at = now();
   ```

   Do this only after a real SMS sender replaces the hook body.
8. **Rollback.**
   - Serve the previous build.
   - Run `supabase/rollback/20261027120000_phone_accounts.rollback.sql` in one transaction, with the owner's approval.
   - Revert the dashboard settings.
   - Phone-only accounts lose access until re-applied.
   - The rollback restores GI2's hosted `user_eligible` body. Where the local-only companion's deletion-aware `deletion_pending` exists, that body drops the deletion-job check.
   - On hosted today the companion is not applied, so the rollback is exact.
   - If the companion is ever applied later, roll the companion back first, then this migration.
   - Running the companion rollback on its own leaves `eligible()` roster-only, which locks out link-grant and phone-only accounts until it is re-applied.

## For the owner

1. On sign-in, "Create account" then Close reopens "Reset password" when a saved reset request exists (the app's `/auth` restore). The browser check no longer pins it.
2. The introduction's "I have an account" still opens email sign-in, while the landing's opens phone sign-in.
3. A phone-only account waiting for access sees the protected line "Your email is confirmed…", which is wrong for phone accounts.
4. An approved account without a name sees About you, then Profile's first-run name card. About you saves only the account metadata.
5. Under Larger Text at 320 px the number field's text scrolls inside the field.

## Not done here

No hosted change, no dashboard change, no EAS build and no TestFlight upload. No template changed, so `supabase/templates/README.md` is unchanged.
