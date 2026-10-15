# UX2: build, hosted rollout and organizer-side acceptance (14–15 October 2026)

- **Spec:** [UX2 design](../../docs/superpowers/specs/2026-10-14-ux2-design.md), approved by the owner on 14 October with decisions UX2-D1 to UX2-D7. The planning amendment, which gives the cover description its own save, was approved with the plan.
- **Plan:** [UX2 plan](../../docs/superpowers/plans/2026-10-14-ux2.md).
- **Code:** built on branch `ux2` from `cb73ebb` to `0882a84`, then fast-forwarded into `main`. The owner chose "Merge back to main locally". It is not pushed yet.

## What shipped

- **Maybe:**
  - Maybe is a new answer.
  - The stored `withdrawn` state reads "Can’t make it now".
  - Only Going opens the sample chat.
- **Guest list after answering (UX-P5):**
  - An invitee sees other guests' names and profile photos only after any answer.
  - The organizer always sees everyone, in a sheet grouped into Going, Maybe, Can’t make it and Not answered yet.
  - Before answering, the event page shows only the organizer and "Answer to see who’s coming". On closed events it shows only the organizer.
- **Notifications (UX-P4):**
  - Only a new time or place queues a change notice, and only for invitees who said Going or Maybe or haven't answered. Cancelling notifies everyone.
  - Each notice records who did it and what happened.
  - The sender writes text from that record, never including the place, note or descriptions. This part is local-only, and sending stays off.
- **Cover description:**
  - An optional description, up to 200 characters, read by VoiceOver on the event page, cards and the Review card.
  - It has its own save, with protection against two devices overwriting each other.
  - The database clears it whenever the photo changes, and account deletion blanks it.
  - The "Describe photo" chip sits below the photo.
- **Other changes:**
  - The owner's UX1 choices: saving an edit returns to the event page with "Changes saved", and the heading reads "My resbites".
  - Bottom sheets stay above the keyboard.
  - The old `change_plan` function is switched off.

## How it was built and checked

- **Process:** subagent-driven, with 12 tasks, each with its own review.
  - Two task fix rounds: a test that couldn't fail, and the sheet under the iOS keyboard.
  - A final whole-branch review on the strongest model, which said "ready with fixes".
  - One fix wave: the editor now keeps the event's stored time zone when the start is unchanged, and six database checks that passed on empty results now fail. The re-review was clean.
- **Final local checks (at `0882a84`):** all pass.
  - The database suite in full mode, and in hosted-baseline mode with the rehearsal. The rehearsal proves the rollback restores the exact pre-UX2 definitions.
  - 56 worker tests.
  - `npm run check`: 205 mobile unit tests and the type check.
  - All 20 browser scripts.
  - The iOS export and the diff check.

## Hosted change

- **Approval.** The owner answered **"Yes, apply it"** for `20261014120000_ux2_rules.sql` (sha256 `57471e0e229b51866bf27d60b2eca009a93886d6835214f4632312ccda288dea`) on 14 October 2026.
- **Applied** with the Supabase MCP `apply_migration` tool as `ux2_rules`. The hosted version is **`20261014163459`**. No `db push` was used.
- **Before** ([hosted-before.json](hosted-before.json), read-only, 16:29 UTC):
  - the 8 expected migrations;
  - the answer check named `attendees_response_check`;
  - the six function fingerprints UX2 replaces matched a fresh local hosted-baseline cluster exactly;
  - 8 events (3 with covers), no guests, an empty queue and 1 tester.
- **After** ([hosted-after.json](hosted-after.json), 16:35 UTC):
  - all nine changed or added function fingerprints match the locally tested migration exactly;
  - the policy, grants and answer check are as designed, and the old edit function is off;
  - the data is unchanged.
  - The advisors show no new security warnings. One new informational "unused index" (`notification_outbox_actor_idx`) is expected while the queue is empty.
- **Baseline map:** `supabase/tests/hosted-baseline/migrations.txt` now lists the hosted version, and `./scripts/test-database.sh --hosted-baseline` passes without a candidate.
- **Not live:** the local-only `20261014130000_ux2_notification_wording.sql` goes live with the notification sender, after that has its own approval.

## iPhone acceptance (stage 1: organizer side)

- **Served:** the new JavaScript went to the owner's development build from `npx expo start --lan --port 8081`. The server log shows the phone's iOS bundle download after the warm-up build, plus a lazily loaded module.
- **Owner, verbatim:** **"all good, everything works on the iPhone"** (15 October).
- **Confirmed in the live data** (read-only queries):
  - **Saving an edit:** "Testing 2" became "Testing 3" through a normal edit. Its version went from 1 to 2, its time zone stayed `America/Argentina/Buenos_Aires`, and no notice was queued.
  - **Describe photo:** "More cats" gained the description "Cat on the couch" through the new save. Its cover revision went from 1 to 2.
- **Owner's word only:** the "My resbites" heading, landing on the event page with "Changes saved", the Describe sheet staying above the keyboard with a one-tap Save, VoiceOver reading the description, and the Larger Text pass. These leave no trace in the data.
- **Not confirmed in the live data:**
  - Changing then removing a description (check 4). Only one description change happened.
  - A new photo clearing the description (check 5). No photo was replaced.

  The owner chose **"Accept as-is"**, so these are recorded as unconfirmed. The browser checks (`verify-covers.mjs`) and the database tests (`ux2.sql` block 4) cover both.
- **Not checkable yet:** the grouped guest sheet, Maybe and the hidden guest list. The owner's events have no guests.

## Stage 2 (invitee side): pending

Per UX2-D6 and UX2-D7, one coworker checks the invitee side on a TestFlight build from `main`:
- opening the invite;
- seeing only the organizer before answering, and the list after;
- Going, Maybe and Can’t make it;
- "Can’t make it now" after backing out of Going;
- the organizer seeing each answer in the grouped sheet.

Before that:
- build TestFlight only from `main` with UX2;
- check the release build points at the live project, with preview off and `/kit` hidden;
- adding the coworker to the tester list is a separate live data change that needs its own approval.

UX2 counts as fully accepted only after this stage.

### TestFlight build configuration (15 October)

The configuration was checked read-only and then fixed on the owner's instruction. The owner's decisions:
- **Internal tester:** the coworker is on the Apple developer team, so there is no beta app review.
- **Bundle identifier:** `com.resbite.app`, replacing `com.resbite.preview`. Android stays `com.resbite.preview`.

Changes in `mobile/eas.json`:
- the production profile reads the Expo `production` environment;
- build numbers are tracked remotely (`appVersionSource: "remote"`).

Changes in `mobile/app.json`:
- `ITSAppUsesNonExemptEncryption: false`;
- specific permission text for photos;
- unused permission entries removed: camera, microphone, motion, Face ID, and the two "always" location entries. The app requests only foreground location, picks photos only from the library, and doesn't use biometric secure-store access.

`npx expo config --type introspect` confirms:
- the bundle identifier;
- only three usage descriptions remain: contacts, location when in use, and the photo library;
- export compliance is set.

**Owner steps for the first build** (interactive, from `mobile/`):
1. `npx eas init` links or creates the Expo project and writes `extra.eas.projectId` and `owner` into `app.json`. Commit that change.
2. Store the live Supabase settings for production builds. `.env.local` is git-ignored and never reaches the cloud build.
   - `set -a; source .env.local; set +a`
   - `npx eas env:create production --name EXPO_PUBLIC_SUPABASE_URL --value "$EXPO_PUBLIC_SUPABASE_URL" --visibility plaintext`
   - `npx eas env:create production --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "$EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY" --visibility plaintext`
3. `npx eas build --platform ios --profile production` signs in to Apple and creates the `com.resbite.app` identifier, certificate and profile.
4. `npx eas submit --platform ios --latest` uploads the build to App Store Connect.
5. Add the coworker as an internal tester.

**The TestFlight app is a separate app.** It installs alongside the development build (`com.resbite.preview`) and has its own sign-in and device storage.

**Invite links** still use `resbite://`. The coworker may need to paste the link into Safari to open it.

## Rollback

- **Database:** run `supabase/rollback/20261014120000_ux2_rules.rollback.sql` in one transaction, after owner approval. It is rehearsed byte-exact. See the plan's rollback notes:
  - the `schema_migrations` row stays;
  - re-applying the file needs a fix-forward migration;
  - remove the `migrations.txt` line.
- **App:** serve the pre-UX2 JavaScript (`cb73ebb`). The previous app works against the UX2 database, except for showing a stored Maybe as "Not answered".
