# Contact invitations: build and rollout runbook (28 October 2026)

- **Spec:** [Contact invitations design](../../docs/superpowers/specs/2026-10-27-contact-invitations-design.md), decisions CI-D1 to CI-D13 and proposals CI-P1 to CI-P13. Contact invitations are plan 2 of 4 (plan 1 is phone accounts).
- **Plan:** [Contact invitations plan](../../docs/superpowers/plans/2026-10-28-contact-invites.md).
- **Code:** branch `contact-invites`, commits `2c6113e` (the plan) to `386d453` (Tasks 1 to 12), the records of Task 13 (`28a9f99`), then the final review's fixes (`76efa6f` to `cd70cf7`) and these records' update. **The migration is live on the hosted project since 28 October 2026 (see "Hosted migration" below); nothing is applied to the Auth dashboard, Vercel, EAS or TestFlight, and the fold function is not deployed.**

## What is built

- **Database (one hosted-compatible migration):** a host looks up which contacts are on Resbite and invites them. People on Resbite get an in-app invitation; everyone else gets a personal link whose code is kept only as a hash. The invitee page shows the invited number's last two digits, checks the number they type (10 wrong checks per hour per invitation), and takes their answer after a phone code. Lookups and invitations share a budget of 500 numbers per person per day under a per-user lock. A single `SECURITY DEFINER` function, `public.fold_web_account`, executable only by `service_role`, folds a web-only account into the account that adds its number.
- **Edge Function `fold-phone-account`:** prepared and switched off in source (`PHONE_FOLD_RELEASE_APPROVED = false`). A fold the database refuses answers 409.
- **Link site (`links/`):** personal invitation pages at `/i/<code>` (number check, code, name and answer, then the "get the app" screen), served by `api/personal.mjs`. The page keeps the invitee's session per invitation code, with the full verified number, until the event starts, and offers "Not you? Sign out" on the answer and "get the app" steps.
- **App:** Invite from contacts (one row per person, "Which number?", badges, WhatsApp or Messages with the link filled in), the Invited group and Invitations on My resbites (answered invitations leave Upcoming; each Invited row offers WhatsApp and Messages, the last used first, from any phone), and at Add your number an offer to fold a web-only account into this one.
- The build calls are in `knowledge-base/08-decisions.md` ("Calls made during the contact invitations build").

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261028120000_contact_invitations.sql` | `78147f2beb73c28b01e19e1bb95fde17c4b96b9da4d4b0ae7b14d2c8514361b4` |
| `supabase/rollback/20261028120000_contact_invitations.rollback.sql` | `a8c8b741c52cb09e69dc2000a9038824b22eab1a2d6e7aa5871f2e823a77c4c6` |

Hosted order: this migration is applied **straight after** `20261027120000_phone_accounts.sql`; both are live since 28 October 2026. Its runbook is [`qa/phone-accounts-2026-10-27/README.md`](../phone-accounts-2026-10-27/README.md); finish that runbook's step 1 first.

## Final local checks (at `cd70cf7`, run on Linux)

- `cd mobile && npm run check`: exit 0. The type check is clean and the 61 test scripts report 460 tests passing, 0 failing; the content validation passes.
- `./scripts/test-database-docker.sh` (Docker `postgres:17`, full mode): exit 0, 27 `PASS` lines, ending `PASS: disposable SQL assertions (full); synthetic roster empty. Auth/Storage HTTP integration is separate.`
- `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261027120000_phone_accounts.sql supabase/migrations/20261028120000_contact_invitations.sql supabase/migrations/20261029120000_open_link_approval.sql supabase/migrations/20261030120000_push_delivery.sql` (all four candidates: `tests.txt` includes `push-delivery.sql`, so a shorter list fails there; see `supabase/README.md`; the PASS count below was recorded with the shorter list): exit 0, 16 `PASS` lines including `contact-invitations.sql (hosted baseline)`, ending `PASS: disposable SQL assertions (hosted); synthetic roster empty. Auth/Storage HTTP integration is separate.`
- Worker tests: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`: 69 of 69 pass.
- Browser QA: `cd mobile && node --import tsx ../links/verify-personal.mjs` passes (headless Chrome: the whole `/i/<code>` journey, Not you? Sign out, and the kept session per code, with every request intercepted). With Expo web on port 8081, `verify-contact-invites.mjs`, `verify-phone.mjs`, `verify-event.mjs` and `review-ui.mjs` pass.

## Hosted migration (applied 28 October 2026)

`20261028120000_contact_invitations.sql` (sha256 `78147f2beb73c28b01e19e1bb95fde17c4b96b9da4d4b0ae7b14d2c8514361b4`) is live on project `ewcsgvhuojxdpaspwsrx` as hosted version `20261028120000`, the second of the four contact-invitation migrations. The owner approved the four by file name and sha256 in chat on 28 October 2026, and they were applied in order the same morning.

- **How:** `supabase db query --linked -f` on the file wrapped in `begin;` and `commit;`, then `supabase migration repair --status applied 20261028120000`, so the hosted version is the file's own. Not `supabase db push`: it would also push the local-only migrations.
- **Before** (`hosted-before.json`): every function, table, policy, trigger, constraint and index in `public` and `private` (`supabase/ops/hosted-fingerprint.sql`) matched a local replay of `migrations.txt` plus `20261027120000_phone_accounts.sql`, 211 of 211 objects. The only difference is hosted's default `service_role` grant on 14 older `public` objects.
- **After** (`hosted-after.json`): matched the local replay of this file, 245 of 245, with no new grant difference. Every existing table kept its row count (`supabase/ops/hosted-counts.sql`).
- **Advisors** (`hosted-advisors-after.json`): new are INFO "RLS enabled, no policy" on `private.lookup_usage` and `private.phone_invitations`; WARN that `anon` and `authenticated` can execute the definers `public.personal_invitation_page` and `public.check_invited_number`, which is intended (the link page calls them before the guest has an account, like `invitation_page`); and INFO that two foreign keys on `private.phone_invitations` (`invited_by`, `user_id`) have no covering index (see the owner items).
- `supabase/tests/hosted-baseline/migrations.txt` carries the line, and `./scripts/test-database-docker.sh --hosted-baseline` (no candidates) passes with 16 `PASS` lines.

## Rollout runbook

Step 1 (the migration) is done. None of the other steps has been run; each is done later, with the owner's approval.

**Precondition (one person, one account):** the fold function (step 2) is deployed and released before, or together with, the link-site deploy (step 3) and the app build that sends personal links (step 4). Without it, an existing tester who answers a personal link on the web gets a second, web-only account holding their number, and Add your number then refuses that number with nothing to fold it into. If the fold can't go out first, hold personal links to existing testers (people who already have a Resbite account) until it does; people new to Resbite may get them.

1. **Migration.** Done on 28 October 2026 (see "Hosted migration" above).
   - The owner approves by file name and sha256 of `20261028120000_contact_invitations.sql` (above).
   - It goes straight after `20261027120000_phone_accounts.sql`.
   - Take hosted before/after snapshots into this directory.
   - Apply it, then run the advisors.
   - Append the line to `supabase/tests/hosted-baseline/migrations.txt` with its hosted version.
2. **Fold function.**
   - Flip `PHONE_FOLD_RELEASE_APPROVED` to `true` in `supabase/functions/_shared/fold-release.ts`, in a reviewed commit, with the owner's approval.
   - Deploy with `supabase functions deploy fold-phone-account --no-verify-jwt`. It must deploy with `verify_jwt = false`, as its README says (the handler verifies both tokens itself).
   - Until then the app shows `foldOff` with no Retry: an undeployed function answers 404 and a deployed one that is still gated off answers 503, and the app maps both to `foldOff`.
3. **Link site.**
   - Regenerate and deploy `links/` (`links/generate.mjs`).
   - Set the Vercel environment variables: `TERMS_URL`, `PRIVACY_URL` and `APP_STORE_URL` (the TestFlight invite), and `TERMS_VERSION` (default `2026-10`). `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `LINK_ORIGIN` are already set for `/r/*`.
   - On the first Vercel preview, check that `/personal-flow.mjs` is served with a JavaScript MIME type (for example `curl -sI <preview>/personal-flow.mjs`). The browser check used a local server; this has not been seen on Vercel.
   - Add a Vercel firewall rate limit on `/i/*` next to the one on `/r/*`.
4. **App build.**
   - Set `EXPO_PUBLIC_INVITATION_ORIGIN=https://link.resbite.com` in the EAS production environment.
   - This build needs the new native build: `LSApplicationQueriesSchemes` (`whatsapp`) in `app.json` only takes effect in a new native build, and WhatsApp opens in the app only once it does.
   - Android: `<queries>` for WhatsApp is B8, not done here.
5. **iPhone checks.**
   - Invite two contacts, one of them a coworker who has the app.
   - Send by WhatsApp and by Messages.
   - Run the web flow on a phone without Resbite (test mode: the code is 000000).
   - Sign into the app with that number; the event is waiting.
   - With an existing account, add a number that answered on the web, then fold it.
6. **Known limits.**
   - Argentine mobile numbers typed in national format may not compose correctly on the web (they need the international form).
   - `/i/` doesn't open the app.
   - A host's codes live on their phone, so another phone sends a new code, and the old link stops working.
7. **Rollback.**
   - Serve the previous build.
   - Run `supabase/rollback/20261028120000_contact_invitations.rollback.sql` in one transaction, with the owner's approval. It removes the grants made by invitations: people who got access through a personal invitation lose it, and `invited` outbox rows are deleted.
   - Redeploy the previous link site.
   - If the function was deployed, take it down too, and set the constant back to `false`.
   - If phone accounts are rolled back as well, roll this migration back first.

## For the owner

1. The web page keeps the invitee's session in that browser's `localStorage`, one entry per invitation with the full verified number, until the event starts, and offers "Not you? Sign out" on the answer and "get the app" steps (minimal fix of the final review). A stricter option is open: log out right after answering, and verify by code again to change the answer. It is safer on shared computers, but flow 3.5's "reopening the link shows their answer" would then need a new code each time.
2. If the event is cancelled while someone is mid-flow, the page says "That isn't the number <host> invited".
3. A host's personal links live on their phone; another phone mints a new link and the old one stops working.
4. Personal links reach existing testers only once the fold is released (the precondition above).
5. The hosted advisors note that `private.phone_invitations` has no index covering its `invited_by` and `user_id` foreign keys. The table is small, so this is harmless for the beta; a later migration can add the two indexes if it grows.

## Not done here

No hosted change, no dashboard change, no Vercel change, no function deploy, no EAS build and no TestFlight upload.
