# Open-link approval: build and rollout runbook (29 October 2026)

- **Spec:** [Contact invitations design](../../docs/superpowers/specs/2026-10-27-contact-invitations-design.md), decision CI-D9 and flow 6. Open-link approval is plan 3 of 4 (plan 1 is phone accounts, plan 2 contact invitations).
- **Plan:** [Open-link approval plan](../../docs/superpowers/plans/2026-10-28-open-link-approval.md).
- **Code:** branch `open-link-approval`, commits `154c97b` (the plan) to the merge into `main`. **Nothing is applied to the hosted project, the Auth dashboard, Vercel, EAS or TestFlight.** This directory will hold the hosted before/after snapshots when the migration is applied.

## What is built

- **Database (one hosted-compatible migration):** the open event link no longer admits anyone. Whoever answers through it becomes a waiting request in `private.join_requests`, one per person per event, with their answer. Waiting people never get an `attendees` row or a live access grant; the host's approval is the only path to both. The owner and people already on the event are never turned into requests.
  - Asking: `request_to_join(p_code, p_name, p_response, p_terms_version)`, `my_join_request(p_code)`, `my_join_requests()` and `change_join_answer(p_plan, p_response)` (a waiting person changes their answer).
  - Deciding: `plan_join_requests(p_plan)` lists a host's waiting people while the event is open (a cancelled or started event lists nobody, and its requests stay waiting); `decide_join_request(p_plan, p_user, p_approve)` approves (the person becomes a normal guest with their answer and gets a `join_approved` notice) or declines (nothing is queued).
  - A turned-off link, a cancelled or started event, an organizer who may no longer use the app, a revoked grant or a disabled roster row refuse a request (`42501` "Invitation unavailable").
  - `claim_plan_link`, `join_by_link` and `fold_web_account` are redefined. The first two now make a waiting request instead of a guest, which is what an old build calls. The fold moves a web-only account's requests over.
  - The outbox gains `join_request` (to the host, the requester as actor) and `join_approved` (to the requester, the host as actor); `beta_access` gains the source `approval`.
- **Link site (`links/`):** `/r/<code>` takes the personal page's steps in open mode: any number can answer, and the answer waits. A person who answered before sees their waiting answer when they open the link again and can change it. A declined person sees "You weren't added to this resbite." A Can't go answer shows the personal page's Can't go screen. The calling code defaults to 44, with an "Outside the UK?" hint. "I have Resbite: open the app" stays.
- **App:** opening a link in the app, or answering it, makes a waiting request. A waiting screen (`/waiting?plan=`) shows the request and lets the person change the answer. An approved request goes straight to the event page; a declined one says "You weren't added to this resbite." The 18+ tick appears inline when the server asks for it. Someone whose access is still pending sees their requests on Account. The host opening their own link lands on their event.
- **Host:** the event page shows "Waiting for you" with each request's name, answer, "via event link", the last two digits of the number, and Approve and Decline, while the event is open (not on a cancelled or started one). The link card (Share, Copy, Turn off) moved from the invitations screen to the event page. A failed decision shows its reason: the event started or was cancelled, the person can't be added, or someone already answered.
- The build calls are in `knowledge-base/08-decisions.md` ("Open-link approval, 28 October 2026").

## Files and hashes

| File | sha256 |
| --- | --- |
| `supabase/migrations/20261029120000_open_link_approval.sql` | `5cd7f723bdd7119d3133c225d1186031e2ec265a054a208e7fef40de9c7f50a0` |
| `supabase/rollback/20261029120000_open_link_approval.rollback.sql` | `9d8e720d9c3bee60bc05cab9f922e6baca6cfc0a9a1deaca4b88cc1aadf5a867` |

The rollback's hash changed with Plan 4 (push delivery): it now refuses, changing nothing, while push delivery is installed (`private.notification_deliveries` exists), so `supabase/rollback/20261030120000_push_delivery.rollback.sql` must run first.

Hosted order: this migration is applied **straight after** `20261028120000_contact_invitations.sql`, which follows `20261027120000_phone_accounts.sql`; none of the three is applied yet. Their runbooks are [`qa/phone-accounts-2026-10-27/README.md`](../phone-accounts-2026-10-27/README.md) and [`qa/contact-invites-2026-10-28/README.md`](../contact-invites-2026-10-28/README.md); finish their migration steps first.

## Final local checks

Run on Linux on 27 October 2026, on the branch head before the merge (the code at `2aed5af`; the later commits change only this runbook, the status page and `verify-planning`'s typing). All passed:

- Database, full mode: 29 PASS. Hosted-baseline mode with the three migrations: 18 PASS, including the rollback rehearsal.
- Worker tests: 69 pass. `npm run check`: 478 tests pass.
- `links/verify-personal.mjs` and `links/verify-open-link.mjs`; the iOS export; every `mobile/scripts/verify-*.mjs` and `review-ui.mjs` against Expo web.
- `verify-planning.mjs` first failed on this branch every time (and passed on `main`): a test typed into a field in a step's first moments, and the text was lost when the field was redrawn. Its four fills right after a step change now use `fillSettled` (fill, wait, check the value, retry); it then passed five runs out of five. It was a timing race in the test, not an app bug.

The commands:

- `cd mobile && npm run check`.
- `./scripts/test-database-docker.sh` (full mode; it includes `supabase/tests/open-link-approval.sql`, the rollback rehearsal and the concurrency scripts, among them `supabase/tests/local/decide-join-concurrency.sh`).
- `./scripts/test-database-docker.sh --hosted-baseline supabase/migrations/20261027120000_phone_accounts.sql supabase/migrations/20261028120000_contact_invitations.sql supabase/migrations/20261029120000_open_link_approval.sql`.
- Worker tests: `node --import ./mobile/node_modules/tsx/dist/loader.mjs --test supabase/functions/_shared/*.test.ts`.
- Browser QA, every request intercepted: `cd mobile && node --import tsx ../links/verify-personal.mjs` and `node --import tsx ../links/verify-open-link.mjs` (headless Chrome), then the app's `mobile/scripts/verify-*.mjs` checks against Expo web on port 8081 with `EXPO_PUBLIC_SUPABASE_URL=https://ewcsgvhuojxdpaspwsrx.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=qa-fixture-key npx expo start --web --port 8081`.

## Rollout runbook

None of these steps has been run. Each is done later, with the owner's approval.

**Order.** The migration ships after `20261028120000_contact_invitations.sql` and before the new app build: the new app calls RPCs that only exist after the migration. The link site is redeployed with, or just after, the migration (step 2).

1. **Migration.**
   - The owner approves by file name and sha256 of `20261029120000_open_link_approval.sql` (above).
   - It goes straight after `20261028120000_contact_invitations.sql`.
   - Take hosted before/after snapshots into this directory (the model is `supabase/tests/hosted-baseline/20261029120000_open_link_approval.before.sql` and `.after.sql`).
   - Apply it, then run the advisors.
   - Append the line to `supabase/tests/hosted-baseline/migrations.txt` with its hosted version.
2. **Link site.**
   - The `/r/` open page changes, so regenerate and deploy `links/` (`links/generate.mjs`).
   - On the first Vercel preview, check that `/personal-flow.mjs` is served with a JavaScript MIME type (for example `curl -sI <preview>/personal-flow.mjs`). This is Plan 2's open item and still stands: the browser checks use a local server, and it has not been seen on Vercel. Check that `/r/<code>` loads its script as well.
   - The Vercel variables from Plan 2's step 3 (`TERMS_URL`, `PRIVACY_URL`, `APP_STORE_URL`, `TERMS_VERSION`) serve the open page too. The firewall rate limit on `/r/*` already exists.
3. **App build.** The same build as Plans 1 and 2: `EXPO_PUBLIC_INVITATION_ORIGIN=https://link.resbite.com` in the EAS production environment, built after the migration. The new native build from Plan 2 (`LSApplicationQueriesSchemes`) covers it. There is nothing new to configure.
4. **iPhone checks.**
   - Open an event's link on a phone without Resbite (in test mode, the test code), answer it, and see Waiting. The event page on the host's phone shows the person under "Waiting for you", and the guest list and the going count do not include them.
   - The host approves: the person appears as a guest with their answer. Their `join_approved` notice is queued; push delivery arrives with Plan 4, so until then they see it the next time they open the link or the app. Sign into the app with that number and the event is there.
   - Decline another person: they see "You weren't added to this resbite." and cannot ask again on the same link. After the host turns the link off and makes a new one, they can ask again.
   - Turn the link off: people already approved stay on the event.
   - Open the link in the app as a person who already has Resbite: they see the same waiting state, and can change their answer while waiting.
   - The host taps their own `/r/` link (from WhatsApp): it opens the event page.
5. **Old builds.**
   - Build 8 can't open `/r/` links at all (it opens them into an error, as before this plan), so nothing changes for it.
   - A build with the GI1 or GI2 code (`claim_plan_link`, `join_by_link`) opening a `/r/` link now creates a waiting request quietly. It receives the event's id but holds no attendee row, so the event page says it isn't available. The host sees the request; the person is told nothing.
   - **Build 10 needs confirming.** GI2's flow on build 10 waits after `join_by_link` for the account to read as approved. A new guest's account now stays unapproved until the host approves, so a new guest may sit on "Joining…". Check this on build 10.
   - A former tester who is already on an event but lost access cannot get it back through the link, because there is nothing for the host to approve: they are an attendee already, so the link makes no request.
   - Ask testers to update to the new build.
6. **Known limits.**
   - The beta is UK-based, so the open page defaults to calling code 44 and no host country is stored.
   - Waiting people see only what the web page shows. The exact place, other guests and meeting details stay hidden until approval.
7. **Rollback.**
   - **Which build: keep serving the current build.** No build has Plans 1 and 2 without Plan 3, so serving an older build would also take away the phone gate (Add your number) and contact invitations.
   - **Link site first:** redeploy the Plan 2 link site, so the web page stops making requests while the database changes. Its `/r/` page is GI1's sheet, which hands off to the app instead of asking to join. The current app can still make a request from a link until the rollback runs; the rollback deletes it with the rest.
   - Then run `supabase/rollback/20261029120000_open_link_approval.rollback.sql` in one transaction, with the owner's approval: `begin; \i supabase/rollback/20261029120000_open_link_approval.rollback.sql; commit;`. It stops, changing nothing, if the contact-invitations rollback has already run.
   - **Order with Plan 4:** if push delivery (`20261030120000_push_delivery.sql`) is applied, run its rollback first; this rollback stops, changing nothing, while `private.notification_deliveries` exists.
   - **Order with Plan 2:** this rollback runs before the contact-invitations rollback, never after it. The contact-invitations rollback drops `fold_web_account` and `private.phone_invitations`, and its two checks cannot go back while request notices or approval grants exist; only this file clears them.
   - **What still works on the current build:** phone sign-in and Add your number, contact invitations and personal links, creating, editing and answering events, the guest list, and the Event link card's Share, Copy and Turn off.
   - **What stops working on the current build:** its open-link path, the waiting screen and Waiting for you call functions that no longer exist. Opening a `/r/` link in the app and the waiting screen show "Check your connection and try again."; Waiting for you and the request list on Account are empty; My resbites keeps showing the last list it read until the app is restarted, then shows none. A link opened in the app stays kept, as for a lost connection, so the app returns to it on a cold start until the person taps "Go to My resbites". A shared event link therefore admits nobody on this build: invite people by number (personal links) instead.
   - Approved guests keep their places and their access: every approval grant becomes a link grant on the same row (live stays live, revoked stays revoked, so a ban stays a ban, and its times stay). Their answers stay.
   - Request notices (`join_request`, `join_approved`) are deleted, delivered or not. The requests table is dropped, so waiting and declined people lose their request.
   - **Waiting web-only people cannot tap the link again to join.** The rolled-back `/r/` page is GI1's sheet, which hands off to the app, and the current build's open-link path no longer works. Only old builds join straight from the link, through the `claim_plan_link` and `join_by_link` bodies the rollback restores. To bring a waiting person in, the host invites their number from Invite people.
   - **Declined people can join again from an old build.** After a rollback, someone the host declined can join through any link that is still live, from a build that calls `claim_plan_link` or `join_by_link` (the GI1 and GI2 behaviour). Before rolling back, turn off the links that matter.

## Open items for the owner

These were parked rather than fixed. None blocks the rollout.

**Decisions to confirm**
1. **Default calling code.** The open page defaults to 44 with an "Outside the UK?" hint. If the beta spreads, this is one attribute and some copy.
2. **Former testers lose their way back.** A former tester already on an event who lost access cannot get it back through the link (step 5). Nothing in this plan restores it; say if it should.
3. **A declined person can ask once more after a rotation.** If a person is declined, the host turns the link off and a new link is made, the person can ask again (once per link).
4. **Waiting people need a name.** The app sends the About you name with the request, because a waiting phone account has no profile. The spec said "no name".

**Small fixes parked**
5. When a fold moves a web-only account over, its undelivered `join_request` notices keep a null actor (the actor foreign key is set null on delete).
6. An eligible caller without a profile who comes through `claim_plan_link` gets a raw `23503` (this was already so in GI1), and `claim_plan_link` does not check the organizer's eligibility for such callers.
7. There is no concurrency script for a request racing a decision. `decide-join-concurrency.sh` covers two decisions racing.

**For Plan 4 (notifications)**
8. `notification_recipient_eligible` needs widening to phone-only recipients, or `join_approved` misses most open-link guests.
9. The recipient check should drop `join_request` rows whose request is no longer waiting.
10. After a fold, consider carrying the requester's name in the outbox detail.

**Clean-up parked**
11. App services: `mine()` and `forPlan` coerce a missing string to an empty one instead of rejecting; `change()` does not check the status; there is no test for a null image; `forPlan` swallows a catch like `readInvited` does; one inline prop type.
12. App screens: a change of answer racing a refresh; `mine()`'s catch is silent; hook dependencies on the load; copy 8b and 8c; the link card's placement; the Account screen does not clear requests on an account switch; `joinView` imports from `services/contactInvites`.
13. Web page: `page.js` and the GI1 sheet styles are no longer used by open pages; `.button.secondary` is defined in both `page.css` and `personal.css`; the open branches could be grouped in a mode object; the lookup after verifying delays the answer step slightly.

**Cosmetic**
14. A waiting person's card in the app (My resbites, Account, the waiting screen) shows the placeholder, not the event's cover photo, because storage row security does not let them read it.
15. If an approval is refused because the event has just started or been cancelled, the reload empties Waiting for you and the reason ("This resbite has started or was cancelled…") goes with it. The event page itself shows the new state, and nobody can be approved then.

## Not done here

No hosted change, no dashboard change, no Vercel change, no EAS build and no TestFlight upload.
