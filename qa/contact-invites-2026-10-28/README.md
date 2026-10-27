# Contact invitations: build and rollout runbook (28 October 2026)

- **Spec:** [Contact invitations design](../../docs/superpowers/specs/2026-10-27-contact-invitations-design.md), decisions CI-D1 to CI-D13 and proposals CI-P1 to CI-P13. Contact invitations are plan 2 of 4 (plan 1 is phone accounts).
- **Plan:** [Contact invitations plan](../../docs/superpowers/plans/2026-10-28-contact-invites.md).
- **Code:** branch `contact-invites`, commits `2c6113e` (the plan) to `386d453` (Tasks 1 to 12), then the records of Task 13. **Nothing is applied to the hosted project, the Auth dashboard, Vercel, EAS or TestFlight.** This directory will hold the hosted before/after snapshots when the migration is applied.

## What is built

- **Database (one hosted-compatible migration):** a host looks up which contacts are on Resbite and invites them. People on Resbite get an in-app invitation; everyone else gets a personal link whose code is kept only as a hash. The invitee page shows the invited number's last two digits, checks the number they type (10 wrong checks per hour per invitation), and takes their answer after a phone code. Lookups and invitations share a budget of 500 numbers per person per day under a per-user lock. A single `SECURITY DEFINER` function, `public.fold_web_account`, executable only by `service_role`, folds a web-only account into the account that adds its number.
- **Edge Function `fold-phone-account`:** prepared and switched off in source (`PHONE_FOLD_RELEASE_APPROVED = false`).
- **Link site (`links/`):** personal invitation pages at `/i/<code>` (number check, code, name and answer, then the "get the app" screen), served by `api/personal.mjs`.
- **App:** Invite from contacts (one row per person, "Which number?", badges, WhatsApp or Messages with the link filled in), the Invited group and Invitations on My resbites (answered invitations leave Upcoming; Send again from any phone), and at Add your number an offer to fold a web-only account into this one.
- The build calls are in `knowledge-base/08-decisions.md` ("Calls made during the contact invitations build").

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261028120000_contact_invitations.sql` | `c35b88b9195b82b2e9c6dbf02ebba256ebe92d2ce54a82436c5fcf869c6fe1af` |
| `supabase/rollback/20261028120000_contact_invitations.rollback.sql` | `3169a076b623234d45320f75b95f20e5a9ed97385143855dead8ee78b23b1392` |

Hosted order: this migration is applied **straight after** `20261027120000_phone_accounts.sql`, which is also not applied yet. Its runbook is [`qa/phone-accounts-2026-10-27/README.md`](../phone-accounts-2026-10-27/README.md); finish that runbook's step 1 first.

## Final local checks (at `386d453`, run on Linux)

- `cd mobile && npm run check`: exit 0. The type check is clean and the 61 test scripts report 448 tests passing, 0 failing; the content validation passes.
- `./scripts/test-database-docker.sh` (Docker `postgres:17`, full mode): exit 0, 27 `PASS` lines, ending `PASS: disposable SQL assertions (full); synthetic roster empty. Auth/Storage HTTP integration is separate.`
- `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261027120000_phone_accounts.sql supabase/migrations/20261028120000_contact_invitations.sql`: exit 0, 16 `PASS` lines including `contact-invitations.sql (hosted baseline)`, ending `PASS: disposable SQL assertions (hosted); synthetic roster empty. Auth/Storage HTTP integration is separate.`
- Worker tests: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`: 66 of 66 pass.
- Browser QA: `cd mobile && node --import tsx ../links/verify-personal.mjs` passes (headless Chrome: the whole `/i/<code>` journey, with every request intercepted). The app's Invite, Invited group, Invitations and fold screens are checked by the scripts added in `386d453`.

## Rollout runbook

None of these steps has been run. Each is done later, with the owner's approval.

1. **Migration.**
   - The owner approves by file name and sha256 of `20261028120000_contact_invitations.sql` (above).
   - It goes straight after `20261027120000_phone_accounts.sql`.
   - Take hosted before/after snapshots into this directory.
   - Apply it, then run the advisors.
   - Append the line to `supabase/tests/hosted-baseline/migrations.txt` with its hosted version.
2. **Fold function.**
   - Flip `PHONE_FOLD_RELEASE_APPROVED` to `true` in `supabase/functions/_shared/fold-release.ts`, in a reviewed commit, with the owner's approval.
   - Deploy with `supabase functions deploy fold-phone-account --no-verify-jwt`. It must deploy with `verify_jwt = false`, as its README says (the handler verifies both tokens itself).
   - Until then the app shows `foldOff`.
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

1. The web page keeps the invitee's full account session in that browser's `localStorage`, with no "not you / sign out" control. This matters on shared computers.
2. "Add your number" shows two buttons both named "Send code" when a number is taken.
3. Web answers made with a "+44 (0) 7700..." style number compose wrongly and use up one of the 10 checks per hour.
4. If the event is cancelled while someone is mid-flow, the page says "That isn't the number <host> invited".
5. A host's personal links live on their phone; another phone mints a new link and the old one stops working.

## Not done here

No hosted change, no dashboard change, no Vercel change, no function deploy, no EAS build and no TestFlight upload.
