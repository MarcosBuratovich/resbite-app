# UX4: build and iPhone acceptance (15 October 2026)

- **Spec:** [UX4 design](../../docs/superpowers/specs/2026-10-15-ux4-design.md), approved by the owner on 15 October with decisions UX4-D1 to UX4-D5. The planning amendment ("Reload saved details" stays as a quiet row) was approved with the plan.
- **Plan:** [UX4 plan](../../docs/superpowers/plans/2026-10-15-ux4.md). The owner chose subagent-driven execution ("approved, go for it with subagent driven").
- **Code:** built on branch `ux4`, from the spec commit `6c26b5b` to `c54f0a9`. It is app only, with no database, service, native or dependency change, so nothing touched the live project.

## What shipped

The 13 remaining screens adopt the UX1 kit, without changing how anything works:
- **Profile:**
  - a photo-and-name card, with ✎ opening a name sheet;
  - one card of rows (People & groups, Account details, Notifications, Data & privacy);
  - Sign out in its own card;
  - the signed-in email shown under the name.
- **Account details** ("About you" in setup, "Account details" when editing): field cards, interest chips, Save, a Skip chip in setup, the privacy notes behind ⓘ, and quiet rows to clear or reload details.
- **The account access check:** one status card per state, with chips for Check again, Email help, Details and Sign out. The guidance is unchanged, word for word.
- **Wellness:** a "Sample data" chip with the disclaimer behind ⓘ, a ring card and one card of category bars (Creative, Physical and Community; UX4-D5).
- **Notifications:** a "Not active yet" status card with the phone permission chip, and the delivery explanation behind ⓘ.
- **Privacy:** topic rows that open today's text in sheets, and a red Delete account row.
- **Delete account:** a short warning card with "What happens" opening the full warnings, numbered steps and a red button. Deletion stays switched off.
- **Landing and introduction:** "Get together" with "Get started" and "I have an account" (now a valid sign-in mode), and three short slides.
- **Sign-in:** one step screen per mode, with field cards, chips and a progress bar for sign-up. The resend countdown is shown on the chip and read by VoiceOver. Focus moves to each new heading.
- **The email-link page:** status cards.

Protected wording (notices, guidance, warnings, privacy statements, photo messages) keeps its exact text. The decisions are recorded in `knowledge-base/08-decisions.md` (UX4), including the 12 changes decided during the build.

## How it was built and checked

- **Process:** subagent-driven, with 12 tasks, each with its own review.
  - The sign-in and Profile logic moved into `useAuthFlow` and `useProfile` first, verbatim (proven by line-by-line diffs), with every existing browser script passing unchanged.
  - Two task fix rounds:
    - sign-in: the resend countdown for VoiceOver, and "Create account" kept on Reset;
    - screenshots: a clipping check that can see buttons pushed off-screen, visible prompts on every field, shorter sign-up placeholders, and centred pill text.
  - A final whole-branch review on the strongest model, which said "ready with fixes".
  - One fix wave: the Resend chips moved below the protected "request another below" notice; Profile shows the signed-in email again; the introduction's sign-in link keeps its old target; Profile no longer flickers on first load; "Check again" and "Email help" are labelled by their visible text (Voice Control); chips are centred in status cards. The re-review was clean.
- **Final local checks (at `c54f0a9`):** all pass.
  - `npm run check`: 213 mobile unit tests and the type check.
  - All 19 `verify-*` browser scripts and `review-ui`, which captures every UX4 screen at 390 and 320 px and under forced Larger Text at 320 px. `verify-deletion` also passed with deletion switched on, against fixtures.
  - The iOS export and the diff check, with nothing changed under `supabase/`, `app.json`, `eas.json`, the lockfile or `ios/`.

## iPhone acceptance

- **Served:** the new JavaScript went to the owner's development build from `npx expo start --lan --port 8081`. The server log shows the phone's iOS bundle download at 15:04 UTC, plus two lazily loaded modules.
- **Owner, verbatim:** **"all good, everything works on the iPhone"** (15 October).
- **Confirmed in the live data** (read-only queries): one account signed in at 15:04:59 UTC, seconds after the bundle loaded. This matches the "sign out and back in" check.
- **Owner's word only.** The landing and introduction, starting and leaving a sign-up, the reset request, the name sheet over the keyboard, Account details, Privacy, Notifications, Wellness, Delete account, and the Larger Text, VoiceOver and Voice Control checks leave no trace in the data.
- **Not confirmed in the live data:** a Profile photo change or removal (no new photo file and no revision change after 15:04), and a saved Account details change (no account update after the sign-in). The owner chose **"Accept as-is"**, so these are recorded as unconfirmed. `verify-profile.mjs` and `verify-account.mjs` cover both in the browser.
- **Seen in the server log, not from UX4:** a supabase-js warning that WebCrypto is unavailable, so the email-link code challenge uses `plain` on iOS. UX4 changed no service code. Look into it separately if wanted.

## Deferred

- To the device or later:
  - the tab bar's labels truncate under the largest forced text sizes in the browser proxy (the tab bar is unchanged by UX4);
  - single-line placeholders can truncate at the very largest sizes;
  - a brief "Welcome back" before a restored sign-in screen (it existed before UX4).
- Smaller polish and test gaps are listed in the project's UX4 follow-up notes.

## Next

- Merged into `main` by fast-forward and pushed on 15 October (the owner chose "1, merge and push it").
- **TestFlight:** UX4 reaches TestFlight in a later build, after the coworker's UX2 invitee check on the current build.

**Rollback:** serve the previous `main` JavaScript. There is no database change.
