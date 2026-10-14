# UX refresh UX1: build, iPhone rounds and acceptance (7–14 October 2026)

- **Spec:** [UX refresh design](../../docs/superpowers/specs/2026-10-07-ux-refresh-design.md), approved by the owner with UX-P1 to UX-P6 on 7 October.
- **Plan:** [UX1 plan](../../docs/superpowers/plans/2026-10-07-ux-refresh-ux1.md).
- **Branch:** `ux-refresh`, built on `b0-pre-b1-fixes`.
- **Benchmark it draws on:** [Event creation app benchmark](../../reports/Event%20creation%20app%20benchmark.md).

UX1 is a JavaScript-only update. It changes no database, adds no dependencies and changes no native configuration.

## What shipped

- **Component kit** (`mobile/src/design/kit.tsx`):
  - chips, tiles and icon buttons;
  - the floating +;
  - cover cards, date badges and avatar stacks;
  - segmented controls, step screens and info sheets;
  - a development-only `/kit` gallery.
- **Creating a resbite** takes step cards: What, When, Where, Vibe, then Review, then "It’s on!" with Invite.
  - Ideas and edits open on Review.
  - The editor logic moved unchanged into `usePlanEditor`.
- **My resbites:**
  - cover cards with Upcoming and Past (cancelled events stay visible);
  - a row of drafts, each with a remove button;
  - a floating +;
  - short notices that show once per save.
- **One event page** (`/event`) for organizers and invitees:
  - opening an invitation link lands straight on Going / Can’t make it;
  - Open in Maps and Do this again;
  - organizer icon actions: Edit, Invite, People, and More (Do this again, Cancel event).
- **Simpler Create tab, idea page, Invitations and People:** short headings, chips, and explanations moved behind ⓘ.
- **Recent places** are kept on the device only and cleared at sign-out.
- **The Preview bar** became a small Preview chip.
- **Benchmark ideas included:**
  - row 1: invite right after creating;
  - row 2: clear required steps;
  - row 4: the review card is the guest view;
  - row 5: Do this again;
  - row 6: Open in Maps;
  - row 7: no themes or text over photos;
  - row 9: claiming lands on the answer;
  - row 14: faster invites;
  - row 15: cancelled events stay visible.

## How it was built and checked

- **Process:** subagent-driven, with a review after every task.
  - A preflight scan of the plan found 23 issues; each got a ruling.
  - A final review of the whole branch was done on the strongest model, then one round of fixes.
- **Commits:** 23, from `9436c01` to `c01897c`.
- **Final checks (at `c01897c`):** all pass.
  - `npm run check`: 200 unit tests, including a guard that fails if layout animations come back.
  - All 20 browser scripts, including the new verify-kit, verify-steps and verify-event, and review-ui (every redesigned screen at 320 and 390 px, plus Larger Text).
  - The database tests, in full and hosted-baseline mode.
  - The iOS export.
  - The diff check.

## iPhone rounds

1. **First delivery (8 October).** Owner feedback, verbatim:
   > "The step by step of creating feels off not quite like the reference. Try to add bigger buttons and icons. When selecting a date is better to have the date picker first full width and bellow the sugestions, same with the time, Where steps is too empty, title and photo are the other way arround and still feel empty the page."

   A revised mockup ("steps v2") was approved: "yes, build it this is the direction". It was built in `2d3b8e3` and `92e1378`.
   - Buttons, tiles and icons are bigger.
   - What has the photo first.
   - When has the calendar and time wheel first, with suggestions below each, and "Choose a day" / "Choose a time" until something is picked.
   - Where and Vibe are fuller.
2. **Second delivery.** Owner, verbatim:
   > "On the when screen, the last 2 rows of the calendar can't be selected as the sugetions too, Also the time is non responsive, It scrolls the page instead of moving the time"

   Root-caused with temporary touch logging on the owner's iPhone:
   - Each step's content was wrapped in a Reanimated layout (`entering`) animation. On the new architecture, that view's native frame stayed at its first-layout size.
   - The pickers appear after "Choose a day", so content below that frame wasn't hit-testable. Taps landed on the scroll view, which scrolled instead.
   - A shared-value animation was tested on the phone. The owner: "done, the calendar and time wheel work now". The logs confirmed taps now reached the step.
   - Fixed in `8b93031` for the step screens and `Reveal`, and refined in `c01897c` (steps slide without fading; VoiceOver focus waits for the slide). A unit test now guards against layout animations.
3. **Draft trap found during that round.** "+" reopens the saved blank draft by design, but Discard was only at the bottom of the review card.
   - Fixed in `313bec3`: Discard draft is offered when leaving from any step, and draft tiles in My resbites have a remove button.
   - A draft whose save still needs checking keeps no remove button.
4. **Acceptance (9 October).** Owner, verbatim: **"all good, everything works on the iPhone"**.

## What the evidence confirms, and what it doesn't

- **Confirmed** in the live data (read-only queries on 9 and 14 October):
  - 4 events were created on the owner's account since 8 October, 2 of them with cover photos.
  - The latest was created at 12:48 UTC on 9 October, after the final fix (`c01897c`).
  - So creating from scratch with a cover works on the real account with the new steps.
- **The When fix** was also confirmed by on-device touch logs.
- **Not confirmed in the live data:**
  - No event created from an idea, no edited event and no newly cancelled event exist since 8 October.
  - Checks 2 (from an idea), 3 (edit) and 5 (cancel shows under Past) left no trace. The owner may have done them in preview mode, which doesn't save to the database.
- **No bundle record for the final build.** The final dev server (port 8082, then 8081) logged no bundle download to the phone, so which build the phone ran for the last checks isn't recorded.
- **Owner decision (14 October):** "Accept as-is". The checks above are recorded as unverified rather than repeated.

## Known limitations and open owner choices

- **Saving an edit returns to My resbites**, not the event page (plan decision; possible follow-up).
- **Organizer actions on the event page are icons only**; owner to judge whether they're recognisable.
- **"Upcoming" appears as both the heading and the first tab.**
- **Invitees see every guest's name and answer.** This was already true before UX1 (My resbites showed attendees), so it's not new. UX2 (UX-P5) limits the guest list to people who have answered.
- **Native-only behaviours** were checked only on the owner's phone or by unit tests, not in browser scripts:
  - the three-option leave alert;
  - VoiceOver focus timing;
  - picker seeding.
- **Other small deferred points** (layout polish, wording, test gaps) are kept for a later pass.

## Rollback

UX1 is JavaScript only. To roll back, serve the previous `main` JavaScript, the CE2 build (`7103aba`), to the development build. No database change is involved.
