# Final review of the App Store readiness branch, 17 November 2026

The whole branch `app-store-readiness` was reviewed at `1e970c5`, after the six plans were merged. Five reviewers each took one area: phone codes and app legal, account deletion, Terms with safety and the link site, retention, and how the plans fit together. An independent verifier then tried to refute each finding. Probes ran on throwaway local databases only; nothing touched the hosted project.

The fixes were made in five lanes that touched separate files. Each lane was reviewed, then merged. A follow-up made the phone fold clear a stale pending number and added two more checks.

On the merged branch, the browser run had one failure. `mobile/scripts/verify-legal.mjs` still expected plan 3's tick line with a link named "Terms". Plan 4 renamed it "Terms of Use", so the check, not the app, was out of date. It is fixed.

## Findings and what happened

The severity is the verifier's, which corrects the reviewer's where it differed.

| Finding | Severity | What | Outcome |
|---|---|---|---|
| phone-and-app-legal #0 | important (plausible) | Auth's raw hook errors (hook_timeout etc.) reach the person, and the 4 s Twilio timeout plus 503 retry design makes that the likely outcome when Twilio is slow | Fixed. A slow or failing Twilio now answers Auth with HTTP 200 and error code 503 and no retry, so nothing is texted twice. The timeout is 3 s. The app and the site show only the hook's own words, and every other Auth message reads "Check your connection and try again." |
| phone-and-app-legal #1 | important (confirmed) | Add your number gate offers only Sign out: Apple or Google accounts that can't verify a number cannot delete themselves in the app | Fixed. Delete account is on Add your number and About you. |
| phone-and-app-legal #2 | important (plausible) | Hook texts a stale pending `new_phone` instead of the account's confirmed number, so sign-in codes can go to a stranger | Fixed differently. When a confirmed number has a different pending one, the hook texts neither. The reviewer's rule, "the confirmed number wins", would have let an account take a number it doesn't hold through the raw Auth API: the lane review caught this. The fold now clears a stale pending number, and a daily purge clears any pending number after 30 days. |
| phone-and-app-legal #3 | minor (plausible) | Signature parser keeps the trailing comma when Auth sends several signatures joined by ", ", so a rotation can refuse every code | Fixed. The parser accepts signatures joined by ", ". |
| phone-and-app-legal #4 | minor (confirmed) | Release check passes a production build with no Supabase URL or publishable key | Fixed. The release check requires the Supabase URL and the publishable key. |
| account-deletion #0 | critical (confirmed) | Accounts with no verified phone (Apple, Google or email sign-ups) can't start deletion in the app: Add your number has only Sign out | Fixed. Delete account is on Add your number, and on About you to match. |
| account-deletion #1 | important (plausible) | Hosted apply will probably fail at COMMENT ON TRIGGER on storage.objects; the runbook's TRIGGER-privilege check can't catch it, and the rollback's DROP TRIGGER has the same owner-only rule (re-raises parked p2 T3) | Fixed. The trigger has no comment. Each rollback finds the trigger by its function's marker and drops the function with cascade, which works without owning storage.objects: a non-owner probe proved it. The runbook's pre-apply check now makes a trial trigger in a rolled-back transaction. |
| account-deletion #2 | minor (confirmed) | Restore procedure doesn't pause plan 6's retention-purge, an in-database cron job, so holds the restore undid can let it purge held records | Fixed (runbook). The restore procedure pauses retention-purge and schedules it again after the holds are put right. |
| account-deletion #3 | minor (confirmed) | A closed or held account that signs in again sees the suspended screen ('appeal'), and its Delete account always fails | Owner decision. What should an account that is being deleted, or is held, see when it signs in again? Today it sees the suspended screen, and Delete account fails. |
| account-deletion #4 | minor (confirmed) | Apple proof has no fallback; a different Apple ID on the iPhone creates a stray Resbite account | Owner decision. Deleting with a different Apple ID than the account's own can create a stray account. |
| account-deletion #5 | minor (confirmed) | When the database accepts but Edge answers 503, the Supabase logout and Apple revocation are skipped and never retried | Fixed. If the database accepted the deletion but Edge answered 503, Edge now looks up the job and still signs the person out and revokes Apple. |
| account-deletion #6 | minor (confirmed) | After an unconfirmed reply the screen says the saved request 'can be checked again' but hides Check deletion status and clears the code | Fixed. After a reply that was never confirmed, the screen shows the saved request and Check deletion status. |
| account-deletion #7 | minor (plausible) | Nothing alerts the owner when a deletion job is stuck, so the 30-day promise can lapse silently | Fixed (runbooks). The stuck-job query and a weekly owner check are written down. There is still no automatic alert. |
| terms-safety-linksite #0 | minor (confirmed) | A final build checks only the four pages; the invitee notice and the app's Terms words can ship while still drafts | Fixed. A final build also checks the invitee notice and the short community rules. |
| terms-safety-linksite #1 | minor (plausible) | A filled honeypot drops a real message and still says "Message sent" | Not changed. A real person never sees the hidden trap field, so a filled trap is treated as a bot. |
| terms-safety-linksite #2 | minor (confirmed) | The accept screen always calls the Terms "the first full version", whatever version the server publishes | Fixed. The accept screen says "We’ve updated our Terms" for any version it doesn't know. The owner should confirm that wording. |
| terms-safety-linksite #3 | minor (confirmed) | check-live passes a draft build deployed to production | Fixed. check-live fails a production build that carries the draft banner or asks not to be indexed. |
| terms-safety-linksite #4 | minor (confirmed) | No test pins the app's TERMS_VERSION, the site fallback and the publish literal to one value | Fixed. links/terms-version.test.mjs pins the app's version, the site's fallback and the publish script to one value. |
| retention #0 | important (confirmed) | series_under_hold misses series a held person was removed from or asked to join, so purge_chats and purge_plans delete them | Fixed. A series counts as under hold when the held person was removed from it, left it, asked to join it or was invited to it. |
| retention #1 | important (confirmed) | The dormant web-account purge erases guests of a series under hold; a series hold never pauses deletion | Fixed. The dormant web-account purge skips any account tied to a series under hold. |
| retention #2 | minor (confirmed) | purge_closed_reports keeps a report only when its series is named by a hold, not when it is under hold | Fixed. purge_closed_reports uses series_under_hold. |
| retention #3 | minor (confirmed) | Cover guard deadlock confirmed (40P01) for a co-host's cover change and for the weekly roll; rare and not worse than parked | Known gap, as already recorded. It is rare, and trying again works. |
| cross-cutting #0 | important (confirmed) | A legal hold on a series (or on a person, which reaches their series) does not stop another account's deletion from erasing that series | Part 1 is fixed: the retention purges respect series holds. Part 2 is an owner and solicitor question: should a series hold also pause other people's own deletions (UK GDPR Art. 17(3)(e))? Today it doesn't (ASR2-4). The records say so, and both options are in the plan 6 runbook's Known gap 9. |
| cross-cutting #1 | important (confirmed) | An Apple or Google account without a phone, suspended or not, cannot reach Delete account: the Add your number gate offers only Sign out | Fixed, as in account-deletion #0. |
| cross-cutting #2 | minor (confirmed) | Answered invitees' numbers are kept until 30 days after the resbite, but the in-app copy, the Privacy Policy, the deletion page and the App Review notes say they are deleted on answer | Documents changed to match the code: the number is kept until 30 days after the resbite ends. Added to the solicitor questions. |
| cross-cutting #3 | important (confirmed) | A web visitor who confirms their number but never answers is kept forever: neither the dormant-web purge nor the unconfirmed purge matches them | Fixed. A web visitor who confirmed a number but never answered is deleted after 12 months. |
| cross-cutting #4 | minor (confirmed) | The link site keeps the browser session (tokens and full number) until the event ends; the Privacy Policy, the deletion page and the retention schedule say until it starts | Documents changed to match the code: the session is kept until the event ends. |
| cross-cutting #5 | minor (plausible) | A number typed at Add your number but never confirmed stays in auth.users.phone_change indefinitely, though the Privacy Policy gives such numbers 30 days | Fixed. private.purge_pending_phone_changes clears a number that was never confirmed, after 30 days. |
| cross-cutting #6 | minor (confirmed) | Under an account hold, a deleted person's name, photo, guest places and chat messages stay visible to others, while the retention schedule says their data stops being visible | Documents changed to say what happens. Hide-and-preserve is now a question for the owner. |
| cross-cutting #7 | minor (confirmed) | run_retention holds chat-row locks across all twelve purges, then takes the global deletion lock, so it can deadlock with an in-app deletion | Fixed. purge_web_accounts only tries the locks, so it never waits on them while holding chat rows. |
| cross-cutting #8 | important (confirmed) | The phone fold ignores legal holds and deletion jobs on the web account it folds and deletes | Fixed. The fold refuses an account under a hold or with a deletion pending, and plan 4's apply now stops unless plan 2 is live. |
| cross-cutting #9 | minor (confirmed) | The Privacy Policy says a replaced or removed photo is deleted 'within 7 days', but the worker deletes it only after a full 7 days | Documents changed: an old photo is deleted about 7 days later. |

## For the owner

- **A series hold and other people's deletions** (cross-cutting #0, part 2). Today a hold on a person stops their deletion, but a hold on a resbite doesn't stop other people's. This needs the solicitor's view.
- **What a closed or held account sees on signing in again** (account-deletion #3).
- **A different Apple ID when deleting** (account-deletion #4).
- **A held deletion leaves the person visible** (cross-cutting #6). Should held data be hidden from other people while it is kept?
- **The "We’ve updated our Terms" wording** (terms-safety-linksite #2).
- **Facts to check at the hosted sittings.** These come from Supabase Auth's behaviour, which couldn't be checked against its source here:
  - Auth honours an HTTP hook's 200 reply that carries an error. Send a code to a refused number at H1.
  - The Admin API leaves `phone_change` set.
  - `postgres` may update `auth.users` on hosted. Plan 6's R2 reads this.
