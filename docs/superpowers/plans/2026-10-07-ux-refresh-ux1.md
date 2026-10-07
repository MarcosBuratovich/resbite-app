# UX Refresh UX1 (Cover Cards, Step Creation, Event Page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship UX1 of the approved UX refresh as a JavaScript-only update. It adds a shared component kit, four-step creation with a Review card and an Invite screen, picture-card My resbites with Upcoming and Past, one event page for organizers and invitees, and a quieter Create tab, idea detail, invitations and people. Drafts, saving, covers, invitations and RSVP behave exactly as before.

**Architecture:**
- **Pure domain first.** New `src/domain/schedule.ts`, `steps.ts` and `eventView.ts`, plus two RSVP helpers, hold every rule the screens need. They cover quick day and time options, per-step validation that wraps the existing messages, the entry step, card and accessibility wording, Upcoming and Past, the Maps link and the "Do this again" draft. All of them are written test-first in Node.
- **Logic leaves the editor before anything looks different.** `usePlanEditor` takes `arrange.tsx`'s state, effects, draft, guard, cover, save and routing code verbatim. The existing browser scripts, unchanged, gate that move. After it, the step screens only render.
- **One kit, then the screens.** `src/design/kit.tsx` provides Chip, Tile, IconButton, Fab, CoverCard, DateBadge, AvatarStack, Segmented, StepScreen and InfoSheet, proven in a development-only `/kit` gallery. The event page (`app/event.tsx` plus `useEvent`) absorbs the invitee view from `invite.tsx`, which keeps only the claim.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19, TypeScript 6, expo-router 57 (typed routes), react-native-web 0.21, Reanimated 4, lucide-react-native, the headless gluestack wrappers, Node 22 `node:test` via `tsx`, and Playwright 1.63 browser QA against Expo web with Supabase intercepted.

**Spec:** `docs/superpowers/specs/2026-10-07-ux-refresh-design.md`, UX1 only: owner decisions UX-D1 to UX-D4 and approved defaults UX-P1, UX-P2 and UX-P6 (UX-P3 to UX-P5 belong to UX2), plus benchmark rows 1, 2, 4, 5, 6, 7, 9, 14 and 15. UX1 starts from `6627207` on branch `ux-refresh`.

## Global Constraints

- Before any mobile command, run `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`.
- Read https://docs.expo.dev/versions/v57.0.0/ before using an Expo API in a new way (`mobile/AGENTS.md`).
- No new npm dependencies, no native configuration changes, no database or migration changes, and no Supabase or MCP calls. UX1 is "a JavaScript update to the existing development build, with no native rebuild and no new dependencies."
- Logic is unchanged: "Draft keys, the draft schema, `writePlan`/`reconcilePlan`, the cover journal and preview mode stay as they are." The draft keys are `edit-<id>`, `new-<activityId>` and `new`. "The current step is **not** stored in the draft, and the draft schema is unchanged."
- "Error, conflict and recovery messages keep their current wording." Copy every such string verbatim from the code you move or replace.
- Input labels stay stable: "Name", "Meeting place", "A note for everyone (optional)" and "Date and time (local)". Category tiles stay role checkbox, labelled with the category name.
- Design principles:
  - one heading per screen, at most three words, with no eyebrows, taglines or subtitles;
  - status is a chip, and explanations sit behind ⓘ;
  - "No text over photos. Pictures sit above a solid info panel. There are no themes, host-chosen colours or animated backgrounds."
  - one primary pill per screen, pinned to the bottom and moved inline under Larger Text.
- Tokens: `r.card = 28`, `r.tile = 22`, `r.chip = 999` and `surface = #F7F4F7`. Category tints and inks stay as approved in CE-D5.
- Accessibility acceptance covers Larger Text (`useLargeText`, fontScale ≥ 1.4), VoiceOver and Reduce Motion (`useReduceMotion`).
  - Motion: "Steps slide (and fade under Reduce Motion), presses scale (and don't under Reduce Motion), and nothing loops."
  - Touch targets are at least 44 pt.
  - `IconButton` requires a label by type.
  - New components express state with `aria-checked`, `aria-selected`, `aria-disabled`, `aria-busy` and `aria-value*`. react-native-web 0.21 ignores `accessibilityState` except for disabled detection, while React Native 0.86 maps `aria-*` on iOS.
  - Live regions keep the existing `accessibilityLiveRegion="polite"` pattern.
- UI copy uses curly apostrophes (’).
- Every new unit test file is appended to the `test` chain in `mobile/package.json`.
- Typed routes are on. After adding a route file (`app/kit.tsx` or `app/event.tsx`), start Expo web once with `--clear` so `.expo/types/router.d.ts` regenerates before `npm run check`.
- Browser QA:
  1. Start `cd mobile && CI=1 npx expo start --web --port 8081 --clear` in the background. If port 8081 is taken (the owner's LAN Metro may be running), use `--port 8082` and prefix every script with `RESBITE_QA_URL=http://localhost:8082`. Every script reads `RESBITE_QA_URL`; `review-ui.mjs` reads it from Task 9 onwards.
  2. Wait for HTTP 200, then run `node scripts/<name>.mjs` from `mobile/`.
  3. Restart with `--clear` after source edits. Stop the server when done.
- SQL tests are unaffected, but `./scripts/test-database.sh` must stay green.
- Commit at the end of each task (fix commits are allowed). The message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage only the task's files, and never `.agents/`, `.mcp.json`, `skills-lock.json`, `.superpowers/`, `reports/` or `research_notes/`. Work on branch `ux-refresh`.

## Review Focus

1. **Larger Text at 320 px on the step screens and cover cards.** Tiles and chips wrap, the primary pill moves inline, the date badge stacks above the time, and nothing scrolls sideways or clips. Pinned by Task 3 (`verify-kit.mjs`, forced Larger Text at 320 px) and Task 5 (`verify-steps.mjs` case 8 walks every step at 320 px with forced Larger Text).
2. **Quick day tiles across midnight, clock changes and time zones.** "Tomorrow" and the weekend tile are calendar days in the device's zone, never "now + 24 h". A time chip at or before now is disabled exactly when `validatePlan` would refuse it. Pinned by Task 1 (`schedule.test.ts`: the London spring-forward night, autumn, Los Angeles and 23:59) and Task 5 (`verify-steps.mjs` case 4, with a fixed browser clock).
3. **Leaving mid-flow.** Close and system or browser back run the existing keep-draft guard on any step, Back only changes the step, and a kept draft resumes at its first missing step. Pinned by Task 5 (`verify-steps.mjs` case 5: dismissing stays on "Where?", accepting leaves, and Continue draft reopens at "Where?").
4. **VoiceOver on a step change.** Focus moves to the new step's title, and a failed Next is announced (role alert on the web, `announceForAccessibility` on iOS). Pinned by Task 5 (`verify-steps.mjs` case 1 asserts the heading is focused after Next and Previous step, and that the error is in an alert).
5. **A restored draft with an unconfirmed save opens at Review**, with its fields locked and "Retry save" resending the journaled write, even if its time has since passed. Pinned by Task 1 (`steps.test.ts`) and Task 5 (`verify-steps.mjs` case 6 seeds such a draft).

## Decisions this plan makes

- **Task order:** the event page (Task 6) lands before the My resbites redesign (Task 7), so every card already has a page to open when the inline actions disappear. All other boundaries follow the brief.
- **The Invite screen is in-place state in `arrange.tsx`, not a route.** The editor already holds the created event's picture, text and cover outcome, so the screen needs no extra read and works offline in preview. The leave guard is already off once saved. "Invite people" replaces the editor with `/invitations?plan=`; "Later" dismisses to My resbites with the created and cover notices.
- **Photo tile:** "Add cover photo" and "Change cover photo" open the system picker directly, and "Remove cover photo" is an icon. The sheet carries the privacy explanation. This avoids presenting the iOS photo picker from a modal that is closing.
- **Blank events keep today's default start** (tomorrow at the current minute), so draft and dirty logic is unchanged. "Do this again" drafts store `start: ""`, so they open at When.
- **"Do this again" copies `activityId`** (to keep the idea picture), and the editor honours a `new` draft's `activityId`. Replacing an existing `new` draft asks first; an unconfirmed `new` save blocks it.
- **Open in Maps** uses the plan's existing `latitude`/`longitude` columns when set (the app never sets them today), then a place typed as "lat, lon" by Use my location, and otherwise the place name.
- **Edit saves still dismiss to My resbites** (post-save routing unchanged), not back to the event page.
- **Browser Larger Text** uses a development-only `?largeText=1` override in `useLargeText`, plus CSS `zoom` on text, as a proxy for Dynamic Type. The iPhone acceptance check 8 remains the real check.
- **"Selected · N" stays a heading in People**, for list navigation and existing tests.
- **Removed once unused:** `EventDetailsFields.tsx` and `CategoryChoices` (Task 5), and `CategoryFilterTile` (Task 8).

## File map

| File | Responsibility | Task |
|---|---|---|
| `mobile/src/domain/schedule.ts` (+ test) | Quick day tiles and time chips, spoken dates, value split and join | 1 |
| `mobile/src/domain/steps.ts` (+ test) | Step order, per-step validation, entry step, progress wording | 1 |
| `mobile/src/domain/eventView.ts` (+ test) | Card chips and labels, Review labels, Upcoming/Past, Maps link, "Do this again" draft, draft routes, cover notices | 1 |
| `mobile/src/domain/rsvp.ts` (+ test) | `answerKey`, `cantMakeItResponse` | 1 |
| `mobile/src/services/recentPlacesStore.ts` (+ test), `recentPlaces.ts` | Device-only recent places | 2 |
| `mobile/src/services/sessionLifecycle.ts`, `src/state/AppState.tsx` | Clear recent places at sign-out and deletion | 2 |
| `mobile/src/design/tokens.ts`, `kit.tsx`, `Chrome.tsx`, `categories.tsx`, `ui.tsx` | Kit, tokens, Preview chip, `fill` pictures, Larger Text override | 3 |
| `mobile/app/kit.tsx`, `scripts/verify-kit.mjs` | Development-only gallery and its browser check | 3 |
| `mobile/src/state/usePlanEditor.ts` | All editor logic, moved out of `arrange.tsx` | 4 |
| `mobile/app/arrange.tsx`, `src/design/PlanSteps.tsx`, `CoverPicker.tsx`, `PlanSchedule.tsx` | Step screens, Review and Invite | 5 |
| `mobile/scripts/qa-helpers.mjs`, `verify-steps.mjs` | Shared flow helpers and new step cases | 5 |
| `mobile/app/event.tsx`, `src/state/useEvent.ts`, `src/services/rsvp.ts`, `app/invite.tsx`, `scripts/verify-event.mjs` | Event page for both roles; claim then land on it | 6 |
| `mobile/app/(tabs)/plans.tsx` | My resbites | 7 |
| `mobile/app/(tabs)/create.tsx`, `app/activity/[id].tsx` | Create tab and idea detail | 8 |
| `mobile/app/invitations.tsx`, `app/people.tsx`, `scripts/review-ui.mjs` | Restyles and screen captures | 9 |

---

### Task 1: Domain helpers for steps, quick dates and event views

**Files:**
- Create: `mobile/src/domain/schedule.ts`, `mobile/src/domain/schedule.test.ts`
- Create: `mobile/src/domain/steps.ts`, `mobile/src/domain/steps.test.ts`
- Create: `mobile/src/domain/eventView.ts`, `mobile/src/domain/eventView.test.ts`
- Modify: `mobile/src/domain/rsvp.ts` (two helpers), `mobile/src/domain/rsvp.test.ts` (one test), `mobile/src/domain/plans.ts` (`Plan` gains optional `latitude`/`longitude`), `mobile/package.json`

**Interfaces:**
- Consumes: `localDateTime`, `parseLocalDateTime` and `Plan` (`src/domain/plans.ts`); `validateEventFields`, `EventFields` (`src/domain/events.ts`); `validatePlan` (`src/domain/rules.ts`); `categoryLabels`, `CategoryKey` (`src/domain/categories.ts`); the `PlanDraft` type (`src/services/draftStore.ts`); `Response` (`src/domain/rsvp.ts`).
- Produces:
  - `schedule.ts`:
    - `addDays(date: Date, days: number): Date` and `localDay(date: Date): string`;
    - `spokenDate(date: Date, now: Date): string`, `spokenDateTime(date: Date, now: Date): string` and `shortDay(date: Date): string`;
    - `type DayKey = "today" | "tomorrow" | "weekend"` and `type DayOption = { key: DayKey; day: string; text: string; label: string }`, with `quickDays(now: Date): DayOption[]`;
    - `QUICK_TIMES` and `type TimeOption = { time: string; label: string; disabled: boolean }`, with `quickTimes(day: string | null, now: Date): TimeOption[]`;
    - `splitLocal(value: string): { day: string | null; time: string | null }` and `joinLocal(day: string, time: string): string`.
  - `steps.ts`:
    - `QUESTION_STEPS`, `type QuestionStep`, `type Step = QuestionStep | "review"`, `STEP_ORDER` and `type StepAnswers = EventFields & { start: string; place: string }`;
    - `stepProblem(step: Step, answers: StepAnswers, now?: number): string | null` and `firstMissingStep(answers: StepAnswers, now?: number): Step | null`;
    - `nextStep(step: Step): Step` and `previousStep(step: Step): Step | null`;
    - `entryStep(input: { mode: "edit" | "idea" | "blank"; restored: boolean; pending: boolean; answers: StepAnswers; now?: number }): Step`;
    - `stepNumber(step: Step): number | null` and `progressLabel(step: number, total?: number): string`.
  - `eventView.ts`:
    - `dateBadgeParts(iso: string | null): { weekday: string; day: string } | null` and `timeText(iso: string | null): string`;
    - `responseText(response: string | null | undefined): string`;
    - `cardChips(card: { owner: boolean; status: string; response?: string | null; going?: number }): string[]` and `cardLabel(card: { title: string; startsAt: string | null; place: string; chips: readonly string[] }, now: Date): string`;
    - `vibeText(categories: readonly CategoryKey[]): string`;
    - `type CoverCardPart = "picture" | "title" | "date" | "place" | "chips"` and `reviewLabels(event: { title: string; startsAt: string | null; place: string; categories: readonly CategoryKey[] }, now: Date): Record<CoverCardPart, string>`;
    - `groupPlans<T extends { status: string; starts_at: string }>(plans: readonly T[], now: number): { upcoming: T[]; past: T[] }`;
    - `mapsUrl(place: { place_label: string; latitude?: number | null; longitude?: number | null }): string | null`;
    - `BLANK_DRAFT_BASELINE`, `againDraft(plan: Plan, options: { scope: string; requestId: string; zone: string; now: Date }): PlanDraft` and `againConflict(drafts: readonly PlanDraft[]): "none" | "replace" | "blocked"`;
    - `draftRoute(draft: Pick<PlanDraft, "key" | "planId" | "activityId">): { plan?: string; activity?: string }`;
    - `coverNotice(outcome: string | string[] | undefined): string | null`.
  - `rsvp.ts`: `answerKey(response: string): "going" | "cant" | null` and `cantMakeItResponse(current: string): Response`.

- [ ] **Step 1: Write the failing tests**

`mobile/src/domain/schedule.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  joinLocal,
  localDay,
  quickDays,
  quickTimes,
  splitLocal,
  spokenDateTime,
} from "./schedule.ts";

// Day boundaries are the device's: every test pins a zone (Node applies TZ changes at runtime).
function inZone<T>(zone: string, run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
const tiles = (now: Date) => quickDays(now).map((d) => [d.key, d.day, d.text]);

test("the weekend tile is the next Saturday that is neither today nor tomorrow, or Sunday when tomorrow is Saturday", () =>
  inZone("Europe/London", () => {
    assert.deepEqual(tiles(new Date("2026-10-07T12:00:00+01:00")), [
      ["today", "2026-10-07", "Today"],
      ["tomorrow", "2026-10-08", "Tomorrow"],
      ["weekend", "2026-10-10", "Sat 10"],
    ]);
    assert.deepEqual(tiles(new Date("2026-10-08T12:00:00+01:00"))[2], ["weekend", "2026-10-10", "Sat 10"]);
    assert.deepEqual(tiles(new Date("2026-10-09T12:00:00+01:00"))[2], ["weekend", "2026-10-11", "Sun 11"]);
    assert.deepEqual(tiles(new Date("2026-10-10T12:00:00+01:00"))[2], ["weekend", "2026-10-17", "Sat 17"]);
    assert.deepEqual(tiles(new Date("2026-10-11T12:00:00+01:00"))[2], ["weekend", "2026-10-17", "Sat 17"]);
    assert.equal(quickDays(new Date("2026-10-09T12:00:00+01:00"))[1].label, "Tomorrow, Saturday 10 October");
  }));

test("days are calendar days in the device's zone, across midnight and clock changes", () => {
  inZone("Europe/London", () => {
    // 23:30 on Saturday 27 March 2027. The clocks go forward that night, so "now + 24 h" would be Monday.
    const night = new Date("2027-03-27T23:30:00Z");
    assert.deepEqual(tiles(night), [
      ["today", "2027-03-27", "Today"],
      ["tomorrow", "2027-03-28", "Tomorrow"],
      ["weekend", "2027-04-03", "Sat 3"],
    ]);
    assert.equal(localDay(addDays(night, 1)), "2027-03-28");
    // One minute after midnight it is the next day.
    assert.equal(quickDays(new Date("2027-03-28T00:01:00Z"))[0].day, "2027-03-28");
    // 23:30 on Saturday 24 October 2026. The clocks go back that night.
    assert.equal(quickDays(new Date("2026-10-24T22:30:00Z"))[1].day, "2026-10-25");
  });
  inZone("America/Los_Angeles", () => {
    // 05:30 UTC on Saturday is still Friday evening in Los Angeles.
    assert.deepEqual(tiles(new Date("2026-10-10T05:30:00Z")), [
      ["today", "2026-10-09", "Today"],
      ["tomorrow", "2026-10-10", "Tomorrow"],
      ["weekend", "2026-10-11", "Sun 11"],
    ]);
  });
});

test("time chips at or before now are disabled, exactly as validatePlan refuses them", () =>
  inZone("Europe/London", () => {
    const now = new Date("2026-10-09T10:30:00+01:00");
    assert.deepEqual(
      quickTimes("2026-10-09", now).map((t) => [t.time, t.disabled]),
      [
        ["09:00", true],
        ["10:00", true],
        ["13:00", false],
        ["18:00", false],
      ],
    );
    assert.ok(quickTimes("2026-10-10", now).every((t) => !t.disabled));
    assert.ok(quickTimes(null, now).every((t) => t.disabled), "No day chosen yet");
    assert.equal(quickTimes("2026-10-09", new Date("2026-10-09T13:00:00+01:00"))[2].disabled, true);
    assert.ok(quickTimes("2026-10-09", new Date("2026-10-09T23:59:00+01:00")).every((t) => t.disabled));
    assert.equal(quickTimes("2026-10-10", now)[1].label, "Saturday 10 October at 10:00");
  }));

test("values keep the editor's local YYYY-MM-DD HH:mm format", () =>
  inZone("Europe/London", () => {
    assert.deepEqual(splitLocal("2026-10-10 18:00"), { day: "2026-10-10", time: "18:00" });
    assert.deepEqual(splitLocal(""), { day: null, time: null });
    assert.deepEqual(splitLocal("2099-02-30 12:00"), { day: null, time: null });
    assert.equal(joinLocal("2026-10-10", "09:00"), "2026-10-10 09:00");
    assert.equal(
      spokenDateTime(new Date(2099, 2, 1, 15, 0), new Date("2026-10-07T12:00:00Z")),
      "Sunday 1 March 2099 at 15:00",
    );
  }));
```

`mobile/src/domain/steps.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  entryStep,
  firstMissingStep,
  nextStep,
  previousStep,
  progressLabel,
  stepNumber,
  stepProblem,
  type StepAnswers,
} from "./steps.ts";

const now = Date.parse("2026-10-07T12:00:00Z");
const complete: StepAnswers = {
  title: "Garden picnic",
  description: "",
  categories: ["natural"],
  start: "2099-03-01 15:00",
  place: "Riverside park",
};

test("each step reports only its own problem, in the existing wording", () => {
  const empty: StepAnswers = { title: " ", description: "d".repeat(1001), categories: [], start: "", place: "  " };
  assert.equal(stepProblem("what", empty, now), "Give your resbite a name.");
  assert.equal(stepProblem("when", empty, now), "Choose a date and time in the future.");
  assert.equal(stepProblem("where", empty, now), "Add a meeting place.");
  assert.equal(stepProblem("vibe", empty, now), "Choose one or two categories.");
  assert.equal(stepProblem("review", empty, now), "Keep the description to 1000 characters.");
  assert.equal(stepProblem("what", { ...complete, title: "x".repeat(81) }, now), "Keep the name to 80 characters.");
  assert.equal(stepProblem("when", { ...complete, start: "2020-01-01 09:00" }, now), "Choose a date and time in the future.");
  assert.equal(stepProblem("when", { ...complete, start: "2099-02-30 12:00" }, now), "Choose a date and time in the future.");
  assert.equal(
    stepProblem("vibe", { ...complete, categories: ["natural", "community", "creative"] }, now),
    "Choose one or two categories.",
  );
  for (const step of ["what", "when", "where", "vibe", "review"] as const)
    assert.equal(stepProblem(step, complete, now), null, step);
});

test("Review re-checks everything in flow order", () => {
  assert.equal(firstMissingStep(complete, now), null);
  assert.equal(firstMissingStep({ ...complete, place: "", categories: [] }, now), "where");
  assert.equal(firstMissingStep({ ...complete, start: "", place: "" }, now), "when");
  assert.equal(firstMissingStep({ ...complete, description: "d".repeat(1001) }, now), "review");
});

test("entry: blank at What, idea and edit at Review, restored drafts at Review when complete or else at the first missing step", () => {
  const entry = (mode: "edit" | "idea" | "blank", restored: boolean, answers: StepAnswers) =>
    entryStep({ mode, restored, pending: false, answers, now });
  assert.equal(entry("blank", false, { ...complete, title: "" }), "what");
  assert.equal(entry("idea", false, { ...complete, place: "" }), "review");
  assert.equal(entry("edit", false, complete), "review");
  assert.equal(entry("blank", true, complete), "review");
  assert.equal(entry("idea", true, { ...complete, place: "" }), "where");
  // "Do this again": everything is copied except the date.
  assert.equal(entry("blank", true, { ...complete, start: "" }), "when");
});

test("a restored unconfirmed save always opens at Review, even when its time has passed", () => {
  assert.equal(
    entryStep({ mode: "blank", restored: true, pending: true, answers: { ...complete, start: "2020-01-01 09:00" }, now }),
    "review",
  );
  assert.equal(
    entryStep({ mode: "edit", restored: true, pending: true, answers: { ...complete, place: "" }, now }),
    "review",
  );
});

test("step order, numbers and progress wording", () => {
  assert.equal(nextStep("what"), "when");
  assert.equal(nextStep("vibe"), "review");
  assert.equal(nextStep("review"), "review");
  assert.equal(previousStep("what"), null);
  assert.equal(previousStep("review"), "vibe");
  assert.equal(stepNumber("where"), 3);
  assert.equal(stepNumber("review"), null);
  assert.equal(progressLabel(2), "Step 2 of 4");
});
```

`mobile/src/domain/eventView.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  againConflict,
  againDraft,
  BLANK_DRAFT_BASELINE,
  cardChips,
  cardLabel,
  coverNotice,
  dateBadgeParts,
  draftRoute,
  groupPlans,
  mapsUrl,
  responseText,
  reviewLabels,
  timeText,
} from "./eventView.ts";
import type { Plan } from "./plans.ts";

function inZone<T>(zone: string, run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test("date badge, start time and the one label a card reads as", () =>
  inZone("Europe/London", () => {
    const now = new Date("2026-10-07T12:00:00+01:00");
    const start = new Date(2099, 9, 10, 10, 0).toISOString();
    assert.deepEqual(dateBadgeParts(start), { weekday: "SAT", day: "10" });
    assert.equal(dateBadgeParts(null), null);
    assert.equal(timeText(start), "10:00");
    assert.equal(timeText(null), "");
    assert.equal(
      cardLabel({ title: "Picnic in the park", startsAt: start, place: "Riverside park", chips: ["Hosting", "3 going"] }, now),
      "Picnic in the park, Saturday 10 October 2099 at 10:00, Riverside park, Hosting, 3 going",
    );
    assert.equal(cardLabel({ title: " ", startsAt: null, place: "", chips: [] }, now), "Your resbite, date not set");
  }));

test("card chips: Cancelled, then the role, then guests or the invitee's answer", () => {
  assert.deepEqual(cardChips({ owner: true, status: "active", going: 0 }), ["Hosting"]);
  assert.deepEqual(cardChips({ owner: true, status: "active", going: 2 }), ["Hosting", "2 going"]);
  assert.deepEqual(cardChips({ owner: false, status: "active", response: "accepted" }), ["Invited", "Going"]);
  assert.deepEqual(cardChips({ owner: false, status: "active", response: "pending" }), ["Invited", "Not answered"]);
  assert.deepEqual(cardChips({ owner: false, status: "active", response: "withdrawn" }), ["Invited", "Can’t make it"]);
  assert.deepEqual(cardChips({ owner: true, status: "cancelled", going: 3 }), ["Cancelled", "Hosting"]);
  assert.equal(responseText("declined"), "Can’t make it");
  assert.equal(responseText(undefined), "Not answered");
});

test("Review parts read as full phrases and say when something is missing", () =>
  inZone("Europe/London", () => {
    const now = new Date("2026-10-07T12:00:00+01:00");
    assert.deepEqual(
      reviewLabels(
        {
          title: "Garden picnic",
          startsAt: new Date(2026, 9, 10, 10, 0).toISOString(),
          place: "Riverside park",
          categories: ["natural", "community"],
        },
        now,
      ),
      {
        picture: "Edit photo",
        title: "Edit name, Garden picnic",
        date: "Edit date and time, Saturday 10 October at 10:00",
        place: "Edit place, Riverside park",
        chips: "Edit vibe, Natural and Community",
      },
    );
    assert.deepEqual(reviewLabels({ title: " ", startsAt: null, place: "", categories: [] }, now), {
      picture: "Edit photo",
      title: "Edit name, not set",
      date: "Edit date and time, not set",
      place: "Edit place, not set",
      chips: "Edit vibe, not set",
    });
  }));

test("Upcoming is active and ahead, soonest first; Past is started or cancelled, latest first", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const plan = (id: string, starts_at: string, status = "active") => ({ id, starts_at, status });
  const { upcoming, past } = groupPlans(
    [
      plan("later", "2026-10-20T10:00:00Z"),
      plan("cancelled-ahead", "2026-10-09T10:00:00Z", "cancelled"),
      plan("soon", "2026-10-08T10:00:00Z"),
      plan("starting-now", "2026-10-07T12:00:00Z"),
      plan("started", "2026-10-07T11:00:00Z"),
      plan("old", "2026-09-01T10:00:00Z"),
    ],
    now,
  );
  assert.deepEqual(upcoming.map((p) => p.id), ["soon", "later"]);
  assert.deepEqual(past.map((p) => p.id), ["cancelled-ahead", "starting-now", "started", "old"]);
});

test("Open in Maps uses saved coordinates, then a typed coordinate pair, else the place name", () => {
  assert.equal(mapsUrl({ place_label: "Fixture café" }), "https://maps.apple.com/?q=Fixture%20caf%C3%A9");
  assert.equal(
    mapsUrl({ place_label: "Riverside park", latitude: 51.5074, longitude: -0.1278 }),
    "https://maps.apple.com/?ll=51.5074,-0.1278&q=Riverside%20park",
  );
  assert.equal(
    mapsUrl({ place_label: "51.50740, -0.12780" }),
    "https://maps.apple.com/?ll=51.50740,-0.12780&q=51.50740%2C%20-0.12780",
  );
  // Out-of-range numbers are a name, not coordinates.
  assert.equal(mapsUrl({ place_label: "95.1, 10.0" }), "https://maps.apple.com/?q=95.1%2C%2010.0");
  assert.equal(mapsUrl({ place_label: "  " }), null);
});

const plan: Plan = {
  id: "p1",
  activity_id: "coffee-together",
  title: "Coffee evening",
  description: "Bring a book",
  categories: ["community", "uplifting"],
  starts_at: "2026-09-01T15:00:00Z",
  time_zone: "UTC",
  place_label: "Fixture café",
  note: "Window table",
  status: "cancelled",
  version: 4,
  owner_id: "u1",
  cover_path: "u1/p1/a.jpg",
  cover_revision: 2,
};
const options = { scope: "u1", requestId: "r1", zone: "Europe/London", now: new Date("2026-10-07T12:00:00Z") };

test("Do this again copies the event text, place, note and idea, never the date, guests or cover", () => {
  const draft = againDraft(plan, options);
  assert.deepEqual(draft, {
    schema: 1,
    scope: "u1",
    key: "new",
    activityId: "coffee-together",
    requestId: "r1",
    original: null,
    initial: BLANK_DRAFT_BASELINE,
    title: "Coffee evening",
    description: "Bring a book",
    categories: ["community", "uplifting"],
    start: "",
    place: "Fixture café",
    note: "Window table",
    zone: "Europe/London",
    pending: null,
    updatedAt: "2026-10-07T12:00:00.000Z",
  });
  assert.equal(BLANK_DRAFT_BASELINE, JSON.stringify(["", "", [], "", "", ""]));
  assert.notEqual(draft.categories, plan.categories, "The categories are a copy");
  assert.equal(againDraft({ ...plan, activity_id: null }, options).activityId, null);
});

test("Do this again never replaces an unconfirmed save and asks before replacing a draft", () => {
  const draft = againDraft(plan, options);
  const write = {
    id: "r1",
    activityId: "coffee-together",
    details: {
      title: "Coffee evening",
      description: "",
      categories: plan.categories,
      starts_at: "2099-01-01T10:00:00Z",
      time_zone: "UTC",
      place_label: "Fixture café",
      note: "",
    },
  };
  assert.equal(againConflict([]), "none");
  assert.equal(againConflict([{ ...draft, key: "edit-p1" }, { ...draft, key: "new-coffee-together" }]), "none");
  assert.equal(againConflict([draft]), "replace");
  assert.equal(againConflict([{ ...draft, pending: write }]), "blocked");
});

test("drafts reopen the editor that wrote them", () => {
  assert.deepEqual(draftRoute({ key: "edit-p1", planId: "p1", activityId: "coffee-together" }), { plan: "p1" });
  assert.deepEqual(draftRoute({ key: "new-coffee-together", activityId: "coffee-together" }), { activity: "coffee-together" });
  assert.deepEqual(draftRoute({ key: "new", activityId: "coffee-together" }), {});
  assert.deepEqual(draftRoute({ key: "new", activityId: null }), {});
});

test("cover outcomes keep their action wording", () => {
  assert.equal(
    coverNotice("pending"),
    "Your resbite is saved, but its cover photo hasn’t uploaded yet. Open Edit plan to retry.",
  );
  assert.equal(
    coverNotice("failed"),
    "Your resbite is saved, but its cover photo couldn’t be prepared. Open Edit plan to add it again.",
  );
  assert.equal(coverNotice("saved"), null);
  assert.equal(coverNotice(undefined), null);
  assert.equal(coverNotice(["pending"]), null);
});
```

In `mobile/src/domain/rsvp.test.ts`, add `answerKey` and `cantMakeItResponse` to the existing import from `"./rsvp"`, then append:
```ts
test("Can’t make it withdraws after Going and declines before ever accepting; the control reads stored answers", () => {
  assert.equal(cantMakeItResponse("accepted"), "withdrawn");
  assert.equal(cantMakeItResponse("withdrawn"), "withdrawn");
  assert.equal(cantMakeItResponse("pending"), "declined");
  assert.equal(cantMakeItResponse("declined"), "declined");
  assert.equal(answerKey("accepted"), "going");
  assert.equal(answerKey("declined"), "cant");
  assert.equal(answerKey("withdrawn"), "cant");
  assert.equal(answerKey("pending"), null);
});
```

In `mobile/package.json`, append to the end of the `test` script:
```
 && node --import tsx src/domain/schedule.test.ts && node --import tsx src/domain/steps.test.ts && node --import tsx src/domain/eventView.test.ts
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && node --import tsx src/domain/schedule.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./schedule.ts`. `steps.test.ts` and `eventView.test.ts` fail the same way, and `rsvp.test.ts` fails because `answerKey` is not exported.

- [ ] **Step 3: Implement**

In `mobile/src/domain/plans.ts`, add these two optional fields to `type Plan`, directly after `cover_revision?: number;`:
```ts
  /** Saved coordinates. The app does not set them yet; Open in Maps prefers them when present. */
  latitude?: number | null;
  longitude?: number | null;
```

`mobile/src/domain/schedule.ts`:
```ts
import { localDateTime, parseLocalDateTime } from "./plans";

// The UX1 "When" step. Values stay in the editor's local `YYYY-MM-DD HH:mm` format.
// Days are calendar days in the device's zone, never "now + 24 hours".
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** Local midnight `days` calendar days after `date`; safe across clock changes. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The local calendar day of `date` as YYYY-MM-DD. */
export function localDay(date: Date): string {
  return localDateTime(date).slice(0, 10);
}

/** "Saturday 10 October", with the year when it is not the current year. */
export function spokenDate(date: Date, now: Date): string {
  const text = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? text : `${text} ${date.getFullYear()}`;
}

/** "Saturday 10 October at 10:00": how chips and cards read to VoiceOver. */
export function spokenDateTime(date: Date, now: Date): string {
  return `${spokenDate(date, now)} at ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Sat 10": the short form on a day tile. */
export function shortDay(date: Date): string {
  return `${WEEKDAYS[date.getDay()].slice(0, 3)} ${date.getDate()}`;
}

export type DayKey = "today" | "tomorrow" | "weekend";
export type DayOption = { key: DayKey; day: string; text: string; label: string };

/** Today, Tomorrow and the weekend tile: the next Saturday that is neither today nor tomorrow, or Sunday when tomorrow is Saturday. */
export function quickDays(now: Date): DayOption[] {
  const today = addDays(now, 0);
  const tomorrow = addDays(now, 1);
  let weekend: Date;
  if (tomorrow.getDay() === 6) weekend = addDays(now, 2);
  else {
    let ahead = (6 - today.getDay() + 7) % 7;
    if (ahead < 2) ahead += 7;
    weekend = addDays(now, ahead);
  }
  return [
    { key: "today", day: localDay(today), text: "Today", label: `Today, ${spokenDate(today, now)}` },
    { key: "tomorrow", day: localDay(tomorrow), text: "Tomorrow", label: `Tomorrow, ${spokenDate(tomorrow, now)}` },
    { key: "weekend", day: localDay(weekend), text: shortDay(weekend), label: spokenDate(weekend, now) },
  ];
}

export const QUICK_TIMES = ["09:00", "10:00", "13:00", "18:00"] as const;
export type TimeOption = { time: string; label: string; disabled: boolean };

/** Quick times on a chosen day. A time at or before now is disabled, as validatePlan would refuse it; with no day chosen, every time is disabled. */
export function quickTimes(day: string | null, now: Date): TimeOption[] {
  return QUICK_TIMES.map((time) => {
    const at = day ? parseLocalDateTime(`${day} ${time}`) : null;
    return {
      time,
      label: at ? spokenDateTime(at, now) : time,
      disabled: !at || at.getTime() <= now.getTime(),
    };
  });
}

/** Splits a valid editor value. Anything else (empty, partial or a calendar rollover) has neither part. */
export function splitLocal(value: string): { day: string | null; time: string | null } {
  return parseLocalDateTime(value)
    ? { day: value.slice(0, 10), time: value.slice(11) }
    : { day: null, time: null };
}

export function joinLocal(day: string, time: string): string {
  return `${day} ${time}`;
}
```

`mobile/src/domain/steps.ts`:
```ts
import type { CategoryKey } from "./categories";
import { validateEventFields, type EventFields } from "./events";
import { parseLocalDateTime } from "./plans";
import { validatePlan } from "./rules";

// UX1 creation steps (UX-D2). Each step wraps the existing validators with valid
// stand-ins for the other answers, so the messages stay exactly as they are.
export const QUESTION_STEPS = ["what", "when", "where", "vibe"] as const;
export type QuestionStep = (typeof QUESTION_STEPS)[number];
export type Step = QuestionStep | "review";
export const STEP_ORDER: readonly Step[] = [...QUESTION_STEPS, "review"];
export type StepAnswers = EventFields & { start: string; place: string };

const VALID_TITLE = "Resbite";
const VALID_CATEGORIES: CategoryKey[] = ["community"];

export function stepProblem(step: Step, answers: StepAnswers, now = Date.now()): string | null {
  switch (step) {
    case "what":
      return validateEventFields({ title: answers.title, description: "", categories: VALID_CATEGORIES });
    case "when":
      return validatePlan(parseLocalDateTime(answers.start)?.toISOString() ?? "", "place", now);
    case "where":
      return validatePlan(new Date(now + 86_400_000).toISOString(), answers.place, now);
    case "vibe":
      return validateEventFields({ title: VALID_TITLE, description: "", categories: answers.categories });
    case "review":
      // The description is added on Review ("+ Description").
      return validateEventFields({ title: VALID_TITLE, description: answers.description, categories: VALID_CATEGORIES });
  }
}

/** Review re-checks everything and names the first incomplete step (benchmark row 2). */
export function firstMissingStep(answers: StepAnswers, now = Date.now()): Step | null {
  return STEP_ORDER.find((step) => stepProblem(step, answers, now) !== null) ?? null;
}

export function nextStep(step: Step): Step {
  return STEP_ORDER[Math.min(STEP_ORDER.indexOf(step) + 1, STEP_ORDER.length - 1)];
}

export function previousStep(step: Step): Step | null {
  const index = STEP_ORDER.indexOf(step);
  return index > 0 ? STEP_ORDER[index - 1] : null;
}

/**
 * Where the editor opens (UX-D3):
 * - a restored unconfirmed save opens at Review, where Retry save is;
 * - a restored draft opens at Review when complete, else at its first missing step;
 * - a blank event opens at What, and an idea or an edit at Review.
 */
export function entryStep(input: {
  mode: "edit" | "idea" | "blank";
  restored: boolean;
  pending: boolean;
  answers: StepAnswers;
  now?: number;
}): Step {
  if (input.pending) return "review";
  if (input.restored) return firstMissingStep(input.answers, input.now) ?? "review";
  return input.mode === "blank" ? "what" : "review";
}

/** 1–4 for the question steps; Review has no progress. */
export function stepNumber(step: Step): number | null {
  const index = (QUESTION_STEPS as readonly string[]).indexOf(step);
  return index < 0 ? null : index + 1;
}

export function progressLabel(step: number, total: number = QUESTION_STEPS.length): string {
  return `Step ${step} of ${total}`;
}
```

`mobile/src/domain/eventView.ts`:
```ts
import { categoryLabels, type CategoryKey } from "./categories";
import type { Plan } from "./plans";
import { spokenDateTime } from "./schedule";
import type { PlanDraft } from "../services/draftStore";

// Wording and grouping for cover cards, Review, My resbites and the event page (UX1).
const BADGE_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const pad = (n: number) => String(n).padStart(2, "0");
const parse = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
};

/** "SAT / 12" on a card; read as part of the card's label, never on its own. */
export function dateBadgeParts(iso: string | null): { weekday: string; day: string } | null {
  const date = parse(iso);
  return date ? { weekday: BADGE_DAYS[date.getDay()], day: String(date.getDate()) } : null;
}

/** Local 24-hour start time, or "" when there is none yet. */
export function timeText(iso: string | null): string {
  const date = parse(iso);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "";
}

/** An invitee's stored answer as a status chip. UX2 adds Maybe and "Can’t make it now". */
export function responseText(response: string | null | undefined): string {
  if (response === "accepted") return "Going";
  if (response === "declined" || response === "withdrawn") return "Can’t make it";
  return "Not answered";
}

/** Chips on a My resbites card: Cancelled first, then the role, then guests (host) or the answer (invitee). */
export function cardChips(card: { owner: boolean; status: string; response?: string | null; going?: number }): string[] {
  const cancelled = card.status === "cancelled";
  const chips = cancelled ? ["Cancelled"] : [];
  chips.push(card.owner ? "Hosting" : "Invited");
  if (cancelled) return chips;
  if (!card.owner) chips.push(responseText(card.response));
  else if (card.going) chips.push(`${card.going} going`);
  return chips;
}

/** The single label a pressable card reads as: title, full date and time, place, chips. */
export function cardLabel(
  card: { title: string; startsAt: string | null; place: string; chips: readonly string[] },
  now: Date,
): string {
  const date = parse(card.startsAt);
  return [
    card.title.trim() || "Your resbite",
    date ? spokenDateTime(date, now) : "date not set",
    card.place.trim(),
    ...card.chips,
  ]
    .filter(Boolean)
    .join(", ");
}

/** "Natural and Community". */
export function vibeText(categories: readonly CategoryKey[]): string {
  return categories.map((key) => categoryLabels[key]).join(" and ");
}

export type CoverCardPart = "picture" | "title" | "date" | "place" | "chips";

/** Review card parts: each is a button that jumps to its step (benchmark row 4). */
export function reviewLabels(
  event: { title: string; startsAt: string | null; place: string; categories: readonly CategoryKey[] },
  now: Date,
): Record<CoverCardPart, string> {
  const date = parse(event.startsAt);
  const orNotSet = (value: string) => value.trim() || "not set";
  return {
    picture: "Edit photo",
    title: `Edit name, ${orNotSet(event.title)}`,
    date: `Edit date and time, ${date ? spokenDateTime(date, now) : "not set"}`,
    place: `Edit place, ${orNotSet(event.place)}`,
    chips: `Edit vibe, ${orNotSet(vibeText(event.categories))}`,
  };
}

/** Upcoming: active and still ahead, soonest first. Past: started or cancelled, latest first (benchmark row 15). */
export function groupPlans<T extends { status: string; starts_at: string }>(
  plans: readonly T[],
  now: number,
): { upcoming: T[]; past: T[] } {
  const at = (plan: T) => Date.parse(plan.starts_at);
  const ahead = (plan: T) => plan.status === "active" && at(plan) > now;
  return {
    upcoming: plans.filter(ahead).sort((a, b) => at(a) - at(b)),
    past: plans.filter((plan) => !ahead(plan)).sort((a, b) => at(b) - at(a)),
  };
}

const TYPED_COORDINATES = /^\s*(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Apple Maps link (benchmark row 6). Opens only when tapped. */
export function mapsUrl(place: { place_label: string; latitude?: number | null; longitude?: number | null }): string | null {
  const label = place.place_label.trim();
  if (!label) return null;
  const query = `q=${encodeURIComponent(label)}`;
  if (typeof place.latitude === "number" && typeof place.longitude === "number")
    return `https://maps.apple.com/?ll=${place.latitude},${place.longitude}&${query}`;
  // "Use my location" writes "lat, lon" when no address is found.
  const typed = TYPED_COORDINATES.exec(label);
  if (typed && Math.abs(Number(typed[1])) <= 90 && Math.abs(Number(typed[2])) <= 180)
    return `https://maps.apple.com/?ll=${typed[1]},${typed[2]}&${query}`;
  return `https://maps.apple.com/?${query}`;
}

/** The editor's untouched blank baseline, in the order of usePlanEditor's snapshotOf: title, description, categories, start, place, note. */
export const BLANK_DRAFT_BASELINE = JSON.stringify(["", "", [], "", "", ""]);

/**
 * "Do this again" (benchmark row 5): a new blank-type draft (key "new") with the title,
 * description, categories, place, note and source idea copied. It never copies the date,
 * guests or cover, so it opens at When.
 */
export function againDraft(
  plan: Plan,
  options: { scope: string; requestId: string; zone: string; now: Date },
): PlanDraft {
  return {
    schema: 1,
    scope: options.scope,
    key: "new",
    activityId: plan.activity_id,
    requestId: options.requestId,
    original: null,
    initial: BLANK_DRAFT_BASELINE,
    title: plan.title,
    description: plan.description,
    categories: [...plan.categories],
    start: "",
    place: plan.place_label,
    note: plan.note,
    zone: options.zone,
    pending: null,
    updatedAt: options.now.toISOString(),
  };
}

/** An unconfirmed new save must never be overwritten; an unfinished new draft is replaced only after asking. */
export function againConflict(drafts: readonly PlanDraft[]): "none" | "replace" | "blocked" {
  const existing = drafts.find((draft) => draft.key === "new");
  if (!existing) return "none";
  return existing.pending ? "blocked" : "replace";
}

/** Route params that reopen the editor that wrote a draft (its key is derived from them). */
export function draftRoute(draft: Pick<PlanDraft, "key" | "planId" | "activityId">): { plan?: string; activity?: string } {
  if (draft.planId) return { plan: draft.planId };
  if (draft.key === "new" || !draft.activityId) return {};
  return { activity: draft.activityId };
}

/** Cover failure notices keep their wording because they ask for action. */
export function coverNotice(outcome: string | string[] | undefined): string | null {
  if (outcome === "pending")
    return "Your resbite is saved, but its cover photo hasn’t uploaded yet. Open Edit plan to retry.";
  if (outcome === "failed")
    return "Your resbite is saved, but its cover photo couldn’t be prepared. Open Edit plan to add it again.";
  return null;
}
```

Append to `mobile/src/domain/rsvp.ts`:
```ts
/** The answer control's selected option for a stored response (UX1: Going / Can’t make it). */
export function answerKey(response: string): "going" | "cant" | null {
  if (response === "accepted") return "going";
  return response === "declined" || response === "withdrawn" ? "cant" : null;
}

/** Can’t make it after Going withdraws (today’s "Withdraw my RSVP"); before ever accepting, it declines. */
export function cantMakeItResponse(current: string): Response {
  return current === "accepted" || current === "withdrawn" ? "withdrawn" : "declined";
}
```

- [ ] **Step 4: Run the checks**

Run: `cd mobile && npm run check`
Expected: a clean typecheck, then every test file passing: 186 tests (167 before UX1, plus 19), 0 failing. Content validation passes.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/domain/schedule.ts mobile/src/domain/schedule.test.ts mobile/src/domain/steps.ts mobile/src/domain/steps.test.ts mobile/src/domain/eventView.ts mobile/src/domain/eventView.test.ts mobile/src/domain/rsvp.ts mobile/src/domain/rsvp.test.ts mobile/src/domain/plans.ts mobile/package.json
git commit -m "Add the domain rules for step creation, quick dates and event cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Recent places on the device (UX-P6)

**Files:**
- Create: `mobile/src/services/recentPlacesStore.ts`, `mobile/src/services/recentPlacesStore.test.ts`, `mobile/src/services/recentPlaces.ts`
- Modify: `mobile/src/services/sessionLifecycle.ts`, `mobile/src/services/sessionLifecycle.test.ts`, `mobile/src/services/deletionLifecycle.test.ts`, `mobile/src/state/AppState.tsx`, `mobile/app/arrange.tsx`, `mobile/scripts/verify-planning.mjs`, `mobile/scripts/verify-people.mjs`, `mobile/package.json`

**Interfaces:**
- Consumes: `KeyStore` (`src/services/secureChunks.ts`), `storage` (`src/services/supabase.ts`), and `useApp().captureSession()`, which returns an assert function that throws `"Session changed. Please try again."`.
- Produces:
  - `RECENT_PLACES_MAX = 5`;
  - `createRecentPlacesStore(storage: KeyStore)` returning:
    - `list(scope: string): Promise<string[]>` (never rejects);
    - `remember(scope: string, place: string, assertCurrent?: () => void): Promise<void>`;
    - `clear(scope: string): Promise<void>`;
  - the singleton `recentPlaces` in `src/services/recentPlaces.ts`;
  - a new required lifecycle dependency `clearRecentPlaces: (scope: string) => Promise<void>`, called for account and preview scopes right after `clearPeople`;
  - the storage key `resbite.recent-places.v1.<scope>`.

- [ ] **Step 1: Write the failing tests**

`mobile/src/services/recentPlacesStore.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createRecentPlacesStore, RECENT_PLACES_MAX } from "./recentPlacesStore.ts";

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: async (k: string) => {
      data.delete(k);
    },
  };
}

test("newest first, deduplicated regardless of case, at most five, blanks ignored", async () => {
  const store = createRecentPlacesStore(memory());
  for (const place of ["Riverside park", "Old mill", "Café Nero", "riverside PARK ", "  ", "Library", "Station", "Market"])
    await store.remember("owner", place);
  assert.equal(RECENT_PLACES_MAX, 5);
  assert.deepEqual(await store.list("owner"), ["Market", "Station", "Library", "riverside PARK", "Café Nero"]);
});

test("places are per scope on this device, and clear removes only that scope", async () => {
  const disk = memory();
  const store = createRecentPlacesStore(disk);
  await store.remember("owner", "Riverside park");
  await store.remember("preview", "Preview café");
  assert.deepEqual(await store.list("other"), []);
  assert.deepEqual([...disk.data.keys()].sort(), [
    "resbite.recent-places.v1.owner",
    "resbite.recent-places.v1.preview",
  ]);
  await store.clear("owner");
  assert.deepEqual(await store.list("owner"), []);
  assert.deepEqual(await store.list("preview"), ["Preview café"]);
});

test("a session change before the write keeps the place off the device", async () => {
  const disk = memory();
  const store = createRecentPlacesStore(disk);
  await assert.rejects(
    store.remember("owner", "Riverside park", () => {
      throw Error("Session changed. Please try again.");
    }),
    /Session changed/,
  );
  assert.equal(disk.data.size, 0);
});

test("unreadable saved places read as none and the next save replaces them", async () => {
  const disk = memory();
  disk.data.set("resbite.recent-places.v1.owner", "{not json");
  const store = createRecentPlacesStore(disk);
  assert.deepEqual(await store.list("owner"), []);
  await store.remember("owner", "Riverside park");
  assert.deepEqual(await store.list("owner"), ["Riverside park"]);
  disk.data.set("resbite.recent-places.v1.owner", JSON.stringify(["Old mill", 7, ""]));
  assert.deepEqual(await store.list("owner"), ["Old mill"]);
});
```

In `mobile/src/services/sessionLifecycle.test.ts`, inside `function lifecycleHarness()`:
1. Change the declaration `const disk = storage(), people = createPeopleStore(disk), events: string[] = [];` so that it also declares `places: string[] = []`, after `events`.
2. In the `createSessionLifecycle({ … })` call, directly after the `clearPeople` entry, add:
```ts
    clearRecentPlaces: async (scope) => {
      places.push(scope);
    },
```
3. Add `places,` to the returned object, after `events,`.

In the same file, in the test `"a failed cover clear fails sign-out before auth sign-out"`, add `clearRecentPlaces: async () => {},` after `clearPeople: async () => {},`. Then append:
```ts
test("sign-out clears recent places for the account and for preview", async () => {
  const h = lifecycleHarness();
  h.life.update({ account: "owner", preview: false });
  await h.life.signOut();
  assert.deepEqual(h.places, ["owner"]);
  const p = lifecycleHarness();
  p.life.update({ account: "owner", preview: true });
  await p.life.signOut();
  assert.deepEqual(p.places, ["preview"]);
});
test("a failed recent-places clear fails sign-out before auth sign-out", async () => {
  const events: string[] = [];
  const life = createSessionLifecycle({
    suspend: () => {},
    resume: () => {},
    clearPeople: async () => {},
    clearRecentPlaces: async () => {
      throw Error("disk");
    },
    clearPhoto: async () => {
      events.push("photo");
    },
    clearCovers: async () => {},
    blockPending: () => () => {},
    clearPending: async () => {},
    authSignOut: async () => {
      events.push("auth");
    },
    finish: () => {},
    busy: () => {},
  });
  life.update({ account: "owner", preview: false });
  await assert.rejects(life.signOut(), /disk/);
  assert.deepEqual(events, []);
});
```

In `mobile/src/services/deletionLifecycle.test.ts`:
- In `setup()`, directly after the `clearPeople` entry, add:
```ts
    clearRecentPlaces: async (s) => {
      calls.push(`places:${s}`);
    },
```
- In the test `"deletion clears drafts as well as scoped data before local-only signout"`, insert `"places:a",` between `"people:a",` and `"photo:a",` in the expected list.
- In the test `"ordinary signout failure cannot resume a deletion-blocked account"`, add `clearRecentPlaces: async () => {},` after the `clearPeople` entry.

In `mobile/package.json`, append ` && node --import tsx src/services/recentPlacesStore.test.ts` to the `test` script.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && node --import tsx src/services/recentPlacesStore.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./recentPlacesStore.ts`. `node --import tsx src/services/sessionLifecycle.test.ts` fails on the new tests (`h.places` is `[]`).

- [ ] **Step 3: Implement**

`mobile/src/services/recentPlacesStore.ts`:
```ts
import type { KeyStore } from "./secureChunks";

export const RECENT_PLACES_MAX = 5;

// UX-P6: the account's last five meeting places, on this device only, cleared at
// sign-out and account deletion. A convenience: unreadable data reads as none.
export function createRecentPlacesStore(storage: KeyStore) {
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  };
  const key = (scope: string) => `resbite.recent-places.v1.${scope}`;
  async function read(scope: string): Promise<string[]> {
    const raw = await storage.getItem(key(scope));
    let items: unknown;
    try {
      items = raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
    return Array.isArray(items)
      ? items
          .filter((item): item is string => typeof item === "string" && item.trim() !== "")
          .slice(0, RECENT_PLACES_MAX)
      : [];
  }
  return {
    list: (scope: string): Promise<string[]> => run(() => read(scope)).catch(() => []),
    remember: (scope: string, place: string, assertCurrent: () => void = () => {}) =>
      run(async () => {
        const value = place.trim();
        if (!value) return;
        assertCurrent();
        const current = await read(scope);
        assertCurrent();
        const lower = value.toLocaleLowerCase();
        const next = [value, ...current.filter((p) => p.toLocaleLowerCase() !== lower)].slice(0, RECENT_PLACES_MAX);
        await storage.setItem(key(scope), JSON.stringify(next));
      }),
    clear: (scope: string) => run(() => storage.removeItem(key(scope))),
  };
}
```

`mobile/src/services/recentPlaces.ts`:
```ts
import { storage } from "./supabase";
import { createRecentPlacesStore } from "./recentPlacesStore";
// Native uses the chunked Keychain/Keystore adapter. Browser QA uses sessionStorage.
export const recentPlaces = createRecentPlacesStore(storage);
```

`mobile/src/services/sessionLifecycle.ts`:
- In `type Dependencies`, add `clearRecentPlaces: (scope: string) => Promise<void>;` after `clearPeople`.
- In `signOut()`, replace:
```ts
            await deps.clearPeople(scope);
            current();
```
with:
```ts
            await deps.clearPeople(scope);
            current();
            await deps.clearRecentPlaces(scope);
            current();
```

`mobile/src/state/AppState.tsx`:
- Add `import { recentPlaces } from "../services/recentPlaces";` after the `peopleStore` import.
- In the `createSessionLifecycle({ … })` call, after `clearPeople: peopleStore.clear,`, add `clearRecentPlaces: (scope) => recentPlaces.clear(scope),`.

`mobile/app/arrange.tsx` (it is written when a save succeeds):
- After `import { planGateway } from "../src/services/plans";`, add `import { recentPlaces } from "../src/services/recentPlaces";`.
- Change `const { preview, session, localPlans, setLocalPlans } = useApp();` to `const { preview, session, localPlans, setLocalPlans, captureSession } = useApp();`.
- In `save()`, directly after `      await drafts.remove(scope!, draftKey);`, add:
```ts
      // Recent places (UX-P6) are a convenience on this device; they never fail the save.
      void recentPlaces
        .remember(scope!, write.details.place_label, captureSession())
        .catch(() => {});
```

`mobile/scripts/verify-planning.mjs`: in the first preview test, directly after the first
```js
  await expect(
    page.getByText("The garden café", { exact: true }),
  ).toBeVisible();
```
add:
```js
  // Recent places (UX-P6): a successful save remembers its place on this device.
  const recent = () =>
    page.evaluate(() => sessionStorage.getItem("resbite.recent-places.v1.preview"));
  await expect.poll(recent).toBe(JSON.stringify(["The garden café"]));
```
Then directly after the later
```js
  await expect(
    page.getByText("The riverside café", { exact: true }),
  ).toBeVisible();
```
add:
```js
  await expect.poll(recent).toBe(JSON.stringify(["The riverside café", "The garden café"]));
```

`mobile/scripts/verify-people.mjs`: directly before the final `getByRole("button", { name: "Leave preview", exact: true })` click, add:
```js
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("resbite.recent-places.v1.preview")),
    JSON.stringify(["Test café"]),
  );
```
After the existing `resbite.people.v1.preview` assertion, add:
```js
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("resbite.recent-places.v1.preview")),
    null,
    "Leaving preview clears recent places",
  );
```

- [ ] **Step 4: Run the checks**

Run: `cd mobile && npm run check`
Expected: a clean typecheck, then 192 tests passing (186 plus 6), 0 failing.

Start Expo web (`--clear`), then run `node scripts/verify-planning.mjs && node scripts/verify-people.mjs && node scripts/verify-covers.mjs`.
Expected: every PASS line from all three scripts.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/services/recentPlacesStore.ts mobile/src/services/recentPlacesStore.test.ts mobile/src/services/recentPlaces.ts mobile/src/services/sessionLifecycle.ts mobile/src/services/sessionLifecycle.test.ts mobile/src/services/deletionLifecycle.test.ts mobile/src/state/AppState.tsx mobile/app/arrange.tsx mobile/scripts/verify-planning.mjs mobile/scripts/verify-people.mjs mobile/package.json
git commit -m "Remember the last five meeting places on the device and clear them at sign-out

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Component kit, Preview chip and kit gallery

**Files:**
- Create: `mobile/src/design/kit.tsx`, `mobile/app/kit.tsx`, `mobile/scripts/verify-kit.mjs`
- Modify: `mobile/src/design/tokens.ts`, `mobile/src/design/ui.tsx` (`useLargeText` override), `mobile/src/design/categories.tsx` (`EventPictureView` `fill`), `mobile/src/design/Chrome.tsx` (full replacement), `mobile/app/_layout.tsx` (register `kit`)

**Interfaces:**
- Consumes: `Button`, `Copy`, `s`, `useLargeText` and `useReduceMotion` (`ui.tsx`); `EventPictureView` (`categories.tsx`); `dateBadgeParts`, `timeText`, `cardLabel`, `reviewLabels` and `type CoverCardPart` (Task 1); `progressLabel` (Task 1).
- Produces, in `src/design/kit.tsx`:
  - `type ChipTone = "neutral" | "aqua" | "pink" | "status"` and `chipToneFor(text: string): ChipTone`;
  - `Chip({ text, icon?, tone?, category?, label?, hint?, onPress?, selected?, disabled? })`;
  - `Tile({ title, subtitle?, icon?, label?, hint?, selected?, disabled?, role?: "button" | "checkbox", category?, size?: "small" | "large", onPress })`;
  - `IconButton({ icon, label, hint?, onPress, disabled?, busy?, tone?: "soft" | "plain" | "pink" })`, where `label` is required;
  - `Fab({ onPress, placement: "float" | "inline" })`, labelled "New resbite";
  - `type CardChip = { key: string; text: string; tone?: ChipTone; category?: CategoryKey; icon?: LucideIcon }`;
  - `CoverCard({ picture, uri?, title, startsAt, place, chips?, label?, onPress?, onPressPart?, partLabels?, dimmed?, hero?, heading? })`;
  - `DateBadge({ startsAt })`;
  - `AvatarStack({ names, label, onPress? })`;
  - `Segmented<K extends string>({ label, options, value, onChange, disabled? })`;
  - `StepScreen({ step, total?, title, hint?, titleRef?, onBack?, onClose, header?, status?, primary?, scrollRef?, direction?, children })`, with test IDs `step-screen`, `step-scroll` and `step-primary`;
  - `InfoSheet({ visible, title, onClose, children })`, with a close button labelled "Close sheet";
  - `focusHeading(target: Text | null): void` and `announce(message: string): void`.
- Also produces:
  - tokens `r = { card: 28, tile: 22, chip: 999 }`, `space` and `colors.surface = "#F7F4F7"`;
  - `EventPictureView` prop `fill?: boolean`;
  - `PreviewNotice` rendered as a "Preview" chip (label "Preview mode") whose sheet says "Actions stay on this device." and offers "Exit preview" when `dismissible`;
  - `useLargeText()` honouring `?largeText=1` on development web builds;
  - route `/kit`.

- [ ] **Step 1: Write the failing browser check**

`mobile/scripts/verify-kit.mjs`:
```js
// The UX1 component kit in its development-only gallery (/kit): roles, labels, selected
// states and 44 pt targets at 390 and 320 px, forced Larger Text at 320 px, and the
// Preview chip. Every Supabase request is aborted.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const out = "/private/tmp/resbite-kit";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const errors = [];
async function open(width, query = "") {
  const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto(`${base}/kit${query}`);
  await expect(page.getByRole("heading", { name: "Kit", exact: true })).toBeVisible();
  return page;
}
async function size(locator) {
  const box = await locator.boundingBox();
  assert.ok(box, "The element is rendered");
  return box;
}
const fitsWidth = (page, selector) =>
  page.evaluate(
    (selector) =>
      [...document.querySelectorAll(`${selector} *`)].every((el) => {
        const box = el.getBoundingClientRect();
        return box.width === 0 || (box.left >= -1 && box.right <= window.innerWidth + 1);
      }),
    selector,
  );
try {
  for (const width of [390, 320]) {
    const page = await open(width);
    // Chip: a pressable chip is a button whose label can say more than its text.
    const maps = page.getByRole("button", { name: "Open Riverside park in Maps", exact: true });
    await expect(maps).toHaveText("Open in Maps");
    await expect(page.getByRole("button", { name: "Hosting", exact: true })).toHaveCount(0);
    // Tile: checkbox tiles carry checked and disabled states; button tiles carry selected.
    const natural = page.getByRole("checkbox", { name: "Natural", exact: true });
    await expect(natural).not.toBeChecked();
    await natural.click();
    await expect(natural).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Creative", exact: true })).toBeDisabled();
    const tomorrow = page.getByRole("button", { name: "Tomorrow, Thursday 8 October", exact: true });
    await expect(tomorrow).toHaveAttribute("aria-selected", "false");
    await tomorrow.click();
    await expect(tomorrow).toHaveAttribute("aria-selected", "true");
    // IconButton and Fab: labelled, with at least 44 pt targets.
    const edit = await size(page.getByRole("button", { name: "Edit Picnic in the park", exact: true }));
    assert.ok(edit.width >= 44 && edit.height >= 44, "IconButton is at least 44 pt");
    const fab = await size(page.getByRole("button", { name: "New resbite", exact: true }));
    assert.ok(fab.width >= 56 && fab.height >= 56, "Fab is at least 56 pt");
    // CoverCard: one button with a composed label; nothing inside is separately focusable.
    const card = page.getByRole("button", {
      name: "Picnic in the park, Saturday 10 October 2099 at 10:00, Riverside park, Hosting, 3 going",
      exact: true,
    });
    await expect(card).toBeVisible();
    await expect(card.getByRole("button")).toHaveCount(0);
    await expect(card.getByText("SAT", { exact: true })).toBeVisible();
    // CoverCard on Review: each part is its own button.
    for (const name of [
      "Edit photo",
      "Edit name, Picnic in the park",
      "Edit date and time, Saturday 10 October 2099 at 10:00",
      "Edit place, Riverside park",
      "Edit vibe, Natural and Community",
    ])
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    // AvatarStack: up to three initials, then a count.
    await expect(page.getByRole("button", { name: "4 going", exact: true })).toContainText("+1");
    // Segmented: a radio group with one checked option.
    await expect(page.getByRole("radiogroup", { name: "Show", exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Upcoming", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "Past", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Past", exact: true })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Upcoming", exact: true })).not.toBeChecked();
    // InfoSheet: a modal sheet with a heading and a close button.
    await page.getByRole("button", { name: "About cover photos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cover photos", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close sheet", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cover photos", exact: true })).toHaveCount(0);
    assert.equal(await fitsWidth(page, '[data-testid="kit"]'), true, `Kit fits ${width} px`);
    await page.screenshot({ path: `${out}/kit-${width}.png`, fullPage: true });
    // StepScreen: progress, a big question title, Previous step and Close, and the pinned pill.
    await page.getByRole("button", { name: "Show step screen", exact: true }).click();
    await expect(page.getByRole("progressbar", { name: "Step 2 of 4", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "When?", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous step", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('[data-testid="step-scroll"]').contains(document.querySelector('[data-testid="step-primary"]')),
      ),
      false,
      "The pill is pinned outside the scroll view at normal text sizes",
    );
    await page.screenshot({ path: `${out}/step-${width}.png` });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Kit", exact: true })).toBeVisible();
    await page.close();
  }
  // Larger Text at 320 px: forced layouts plus scaled text (a browser proxy for Dynamic Type).
  {
    const page = await open(320, "?largeText=1");
    await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    const fab = await size(page.getByRole("button", { name: "New resbite", exact: true }));
    assert.ok(fab.width > 200, "The Fab becomes an inline pill under Larger Text");
    assert.equal(await fitsWidth(page, '[data-testid="kit"]'), true, "Nothing scrolls sideways at 320 px");
    await page.screenshot({ path: `${out}/kit-large-320.png`, fullPage: true });
    await page.getByRole("button", { name: "Show step screen", exact: true }).click();
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('[data-testid="step-scroll"]').contains(document.querySelector('[data-testid="step-primary"]')),
      ),
      true,
      "The pill moves inline under Larger Text",
    );
    assert.equal(await fitsWidth(page, '[data-testid="step-screen"]'), true, "The step screen fits 320 px");
    await page.close();
  }
  // Preview chip: a small header chip whose sheet explains preview and offers Exit preview.
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*.supabase.co/**", (route) => route.abort());
    await page.goto(base);
    await page.getByText("Preview the design", { exact: true }).click();
    await page.getByRole("button", { name: "Preview mode", exact: true }).filter({ visible: true }).click();
    await expect(page.getByText("Actions stay on this device.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Exit preview", exact: true }).click();
    await expect(page.getByText("Preview the design", { exact: true })).toBeVisible();
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: kit roles, labels, selected states and 44 pt targets at 390/320; Larger Text at 320; Preview chip and sheet. Screenshots: " +
      out,
  );
} finally {
  await browser.close();
}
```

Start Expo web (`--clear`) and run: `cd mobile && node scripts/verify-kit.mjs`
Expected: FAIL, because `/kit` is an unmatched route and the heading "Kit" never appears.

- [ ] **Step 2: Add the tokens, the Larger Text override and full-size pictures**

`mobile/src/design/tokens.ts`:
- Add `surface: "#F7F4F7",` to `colors`, after `purpleSoft`.
- Append:
```ts
// UX1 component kit (spec "Component kit"): radii and a spacing scale.
export const r = { card: 28, tile: 22, chip: 999 } as const;
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
```

`mobile/src/design/ui.tsx`: replace
```ts
export function useLargeText() {
  return useWindowDimensions().fontScale >= 1.4;
}
```
with:
```ts
// Browser QA can force the Larger Text layouts with ?largeText=1 (development web builds only).
const forcedLargeText =
  __DEV__ &&
  Platform.OS === "web" &&
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("largeText");
export function useLargeText() {
  const { fontScale } = useWindowDimensions();
  return forcedLargeText || fontScale >= 1.4;
}
```

`mobile/src/design/categories.tsx`:
- Change the `EventPictureView` signature and body to:
```tsx
export function EventPictureView({
  picture,
  size = 66,
  fill = false,
}: {
  picture: EventPicture;
  size?: number;
  /** Fill the parent (cover cards) instead of a size × size square. */
  fill?: boolean;
}) {
  if (picture.kind === "cover") return <CoverThumb picture={picture} size={size} fill={fill} />;
  if (picture.kind === "artwork")
    return (
      <Image
        source={artwork[picture.key]}
        style={fill ? styles.fill : { width: size, height: size }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  const Icon = categoryIcons[picture.category];
  const { tint, ink } = categoryPalette[picture.category];
  if (fill)
    return (
      <View accessible={false} style={[styles.fill, { alignItems: "center", justifyContent: "center" }]}>
        <Icon size={64} strokeWidth={1.4} color={ink} />
      </View>
    );
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: tint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={1.6} color={ink} />
    </View>
  );
}
```
- Change `CoverThumb` to accept and pass `fill`:
```tsx
function CoverThumb({
  picture,
  size,
  fill,
}: {
  picture: Extract<EventPicture, { kind: "cover" }>;
  size: number;
  fill: boolean;
}) {
  const uri = useCoverUri(picture.path);
  if (!uri) return <EventPictureView picture={picture.fallback} size={size} fill={fill} />;
  return (
    <Image
      source={{ uri }}
      style={fill ? styles.fill : { width: size, height: size, borderRadius: size / 4 }}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
    />
  );
}
```
- Add `fill: { width: "100%", height: "100%" },` to its `StyleSheet.create`.

- [ ] **Step 3: Write the kit**

`mobile/src/design/kit.tsx`:
```tsx
import React from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { FadeIn, SlideInLeft, SlideInRight } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, MapPin, Plus, X, type LucideIcon } from "lucide-react-native";
import { Button, Copy, s, useLargeText, useReduceMotion } from "./ui";
import { EventPictureView } from "./categories";
import { categoryPalette, colors as c, depth, fonts, r, space } from "./tokens";
import type { CategoryKey } from "../domain/categories";
import type { EventPicture } from "../domain/events";
import { dateBadgeParts, timeText, type CoverCardPart } from "../domain/eventView";
import { progressLabel } from "../domain/steps";

// UX1 component kit (spec "Component kit"). States use aria-* props: react-native-web
// 0.21 ignores accessibilityState, while React Native maps aria-* on iOS.

export type ChipTone = "neutral" | "aqua" | "pink" | "status";
const tones: Record<ChipTone, { tint: string; ink: string }> = {
  neutral: { tint: c.surface, ink: c.ink },
  aqua: { tint: c.aquaSoft, ink: c.aquaDark },
  pink: { tint: c.pinkSoft, ink: "#963F58" },
  status: { tint: c.purpleSoft, ink: "#665381" },
};

/** The tone for a role or status chip text. */
export function chipToneFor(text: string): ChipTone {
  if (text === "Cancelled") return "pink";
  if (text === "Hosting") return "aqua";
  if (text === "Invited") return "status";
  return "neutral";
}

/** An icon and short text in a tinted tone. A pressable chip is a button whose label may say more than its text. */
export function Chip({
  text,
  icon: Icon,
  tone = "neutral",
  category,
  label,
  hint,
  onPress,
  selected = false,
  disabled = false,
}: {
  text: string;
  icon?: LucideIcon;
  tone?: ChipTone;
  category?: CategoryKey;
  label?: string;
  hint?: string;
  onPress?: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const { tint, ink } = category ? categoryPalette[category] : tones[tone];
  const fg = selected ? c.paper : ink;
  const body = (
    <>
      {Icon && <Icon size={15} strokeWidth={1.8} color={fg} />}
      <Copy style={[styles.chipText, { color: fg }]}>{text}</Copy>
    </>
  );
  if (!onPress)
    return (
      <View accessible={label !== undefined} accessibilityLabel={label} style={[styles.chip, { backgroundColor: tint }]}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? text}
      accessibilityHint={hint}
      aria-selected={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        styles.chipPressable,
        { backgroundColor: selected ? ink : tint, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      {body}
    </Pressable>
  );
}

/** A rounded selectable tile (day, category or action), at least 44 pt. */
export function Tile({
  title,
  subtitle,
  icon: Icon,
  label,
  hint,
  selected = false,
  disabled = false,
  role = "button",
  category,
  size = "small",
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  label?: string;
  hint?: string;
  selected?: boolean;
  disabled?: boolean;
  role?: "button" | "checkbox";
  category?: CategoryKey;
  size?: "small" | "large";
  onPress: () => void;
}) {
  const { tint, ink } = category ? categoryPalette[category] : { tint: c.aquaSoft, ink: c.aquaDark };
  const large = size === "large";
  const state = role === "checkbox" ? { "aria-checked": selected } : { "aria-selected": selected };
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityHint={hint}
      {...state}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        large && styles.tileLarge,
        {
          backgroundColor: selected ? tint : large ? c.pink : c.paper,
          borderColor: selected ? ink : large ? "#F8CBD0" : c.line,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {Icon && (
        <Icon size={large ? 28 : 20} strokeWidth={1.7} color={selected ? ink : large ? "#963F58" : c.aquaDark} />
      )}
      <Copy
        style={
          large
            ? [styles.tileTitle, styles.tileTitleLarge, { color: selected ? ink : c.ink }]
            : [styles.tileTitle, { color: selected ? ink : c.ink }]
        }
      >
        {title}
      </Copy>
      {subtitle ? <Copy style={styles.tileSubtitle}>{subtitle}</Copy> : null}
    </Pressable>
  );
}

/** A 44 pt circular icon button. The label is required: it carries the full meaning. */
export function IconButton({
  icon: Icon,
  label,
  hint,
  onPress,
  disabled = false,
  busy = false,
  tone = "soft",
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "soft" | "plain" | "pink";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      aria-disabled={disabled || busy}
      aria-busy={busy}
      disabled={disabled || busy}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: tone === "plain" ? "transparent" : tone === "pink" ? c.pinkSoft : c.surface,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {busy ? <ActivityIndicator color={c.aquaDark} /> : <Icon size={21} strokeWidth={1.8} color={c.ink} />}
    </Pressable>
  );
}

/**
 * The floating + labelled "New resbite". Under Larger Text it renders inline as a pill instead.
 * Screens place one of each: `placement="inline"` in the content, `placement="float"` in an
 * absolutely positioned layer above the tab bar.
 */
export function Fab({ onPress, placement }: { onPress: () => void; placement: "float" | "inline" }) {
  const largeText = useLargeText();
  if (largeText !== (placement === "inline")) return null;
  if (placement === "inline") return <Button title="New resbite" onPress={onPress} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New resbite"
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
    >
      <Plus size={28} strokeWidth={2} color={c.ink} />
    </Pressable>
  );
}

/** "SAT / 12". Hidden from assistive tech: the card's label already says the date. */
export function DateBadge({ startsAt }: { startsAt: string | null }) {
  const parts = dateBadgeParts(startsAt);
  return (
    <View aria-hidden style={styles.badge}>
      <Text style={styles.badgeWeekday}>{parts?.weekday ?? "—"}</Text>
      <Text style={styles.badgeDay}>{parts?.day ?? ""}</Text>
    </View>
  );
}

export type CardChip = { key: string; text: string; tone?: ChipTone; category?: CategoryKey; icon?: LucideIcon };

function CoverArt({ picture, uri }: { picture: EventPicture; uri?: string | null }) {
  if (uri)
    return <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />;
  const basic = picture.kind === "cover" ? picture.fallback : picture;
  const tint = basic.kind === "placeholder" ? categoryPalette[basic.category].tint : c.cream;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, alignItems: "center", justifyContent: "center" }]}>
      <EventPictureView picture={picture} fill />
    </View>
  );
}

/**
 * A picture above a solid info panel; never text over the photo (spec principle 5).
 * - `onPress`: the whole card is one button with the composed `label`; nothing inside is focusable.
 * - `onPressPart` + `partLabels`: Review. Each part is its own button that jumps to its step.
 * - Otherwise the title is the screen's heading, unless `heading={false}`.
 */
export function CoverCard({
  picture,
  uri,
  title,
  startsAt,
  place,
  chips = [],
  label,
  onPress,
  onPressPart,
  partLabels,
  dimmed = false,
  hero = false,
  heading = true,
}: {
  picture: EventPicture;
  uri?: string | null;
  title: string;
  startsAt: string | null;
  place: string;
  chips?: readonly CardChip[];
  label?: string;
  onPress?: () => void;
  onPressPart?: (part: CoverCardPart) => void;
  partLabels?: Record<CoverCardPart, string>;
  dimmed?: boolean;
  hero?: boolean;
  heading?: boolean;
}) {
  const largeText = useLargeText();
  const parts = Boolean(onPressPart && partLabels);
  const part = (key: CoverCardPart, children: React.ReactNode, style?: StyleProp<ViewStyle>) =>
    parts ? (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityLabel={partLabels![key]}
        onPress={() => onPressPart!(key)}
        style={({ pressed }) => [styles.part, style, pressed && { backgroundColor: c.surface }]}
      >
        {children}
      </Pressable>
    ) : (
      <View key={key} style={style}>
        {children}
      </View>
    );
  const time = timeText(startsAt);
  const content = (
    <>
      {part(
        "picture",
        <View style={[styles.picture, { height: hero ? 220 : 168 }, dimmed && { opacity: 0.5 }]}>
          <CoverArt picture={picture} uri={uri} />
        </View>,
      )}
      <View style={styles.panel}>
        {part(
          "title",
          <Text
            accessibilityRole={!onPress && !parts && heading ? "header" : undefined}
            style={[styles.cardTitle, hero && styles.cardTitleHero, largeText && { lineHeight: undefined }]}
          >
            {title}
          </Text>,
        )}
        {part(
          "date",
          <>
            <DateBadge startsAt={startsAt} />
            <Copy style={styles.cardLine}>{time || "Date to choose"}</Copy>
          </>,
          [styles.dateRow, largeText && styles.stacked],
        )}
        {part(
          "place",
          <>
            <MapPin size={16} color={c.muted} />
            <Copy style={styles.cardLine}>{place.trim() || "Place to choose"}</Copy>
          </>,
          styles.placeRow,
        )}
        {(chips.length > 0 || parts) &&
          part(
            "chips",
            <View style={styles.chipRow}>
              {chips.length > 0 ? (
                chips.map((chip) => (
                  <Chip key={chip.key} text={chip.text} tone={chip.tone} category={chip.category} icon={chip.icon} />
                ))
              ) : (
                <Chip text="Pick a vibe" />
              )}
            </View>,
          )}
      </View>
    </>
  );
  if (onPress)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      >
        {content}
      </Pressable>
    );
  return <View style={styles.card}>{content}</View>;
}

/** Up to three initial avatars plus a count; reads as its label, for example "3 going". */
export function AvatarStack({ names, label, onPress }: { names: readonly string[]; label: string; onPress?: () => void }) {
  const shown = names.slice(0, 3);
  const extra = names.length - shown.length;
  const body = (
    <>
      <View style={styles.avatars}>
        {shown.map((name, i) => (
          <View key={`${name}-${i}`} style={[styles.avatar, i > 0 && { marginLeft: -10 }]}>
            <Text style={styles.avatarText}>{(name.trim()[0] ?? "?").toLocaleUpperCase()}</Text>
          </View>
        ))}
        {extra > 0 && <Copy style={styles.avatarExtra}>{`+${extra}`}</Copy>}
      </View>
      <Copy style={{ fontSize: 14 }}>{label}</Copy>
    </>
  );
  if (!onPress)
    return (
      <View accessible accessibilityLabel={label} style={styles.avatarRow}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Shows the guest list"
      onPress={onPress}
      style={({ pressed }) => [styles.avatarRow, { opacity: pressed ? 0.75 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

/** Two or three options as a radio group (Upcoming/Past, Going/Can’t make it). */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: readonly { key: K; text: string; label?: string }[];
  value: K | null;
  onChange: (key: K) => void;
  disabled?: boolean;
}) {
  const largeText = useLargeText();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segmented, largeText && styles.stacked]}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityLabel={option.label ?? option.text}
            aria-checked={selected}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => {
              if (!selected) onChange(option.key);
            }}
            style={[styles.segment, largeText && { flex: 0, alignSelf: "stretch" }, selected && styles.segmentOn, disabled && { opacity: 0.55 }]}
          >
            <Copy style={selected ? [styles.segmentText, styles.segmentTextOn] : styles.segmentText}>{option.text}</Copy>
          </Pressable>
        );
      })}
    </View>
  );
}

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={progressLabel(step, total)}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      style={styles.progress}
    >
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.bar, i < step && styles.barOn]} />
      ))}
    </View>
  );
}

/**
 * One question per screen: progress (read as "Step 2 of 4"), a big question title
 * (a header), the content and the pinned primary pill, which moves inline under Larger
 * Text. "Previous step" changes the step; "Close" leaves through the caller's guard.
 * Content slides in, or fades under Reduce Motion.
 */
export function StepScreen({
  step,
  total = 4,
  title,
  hint,
  titleRef,
  onBack,
  onClose,
  header,
  status,
  primary,
  scrollRef,
  direction = "forward",
  children,
}: {
  step: number | null;
  total?: number;
  title: string;
  hint?: string;
  titleRef?: React.RefObject<Text | null>;
  onBack?: () => void;
  onClose: () => void;
  header?: React.ReactNode;
  status?: string;
  primary?: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
  direction?: "forward" | "back";
  children: React.ReactNode;
}) {
  const largeText = useLargeText();
  const reduce = useReduceMotion();
  const entering = reduce
    ? FadeIn.duration(120)
    : (direction === "back" ? SlideInLeft : SlideInRight).duration(220);
  const footer = (
    <View testID="step-primary" style={[s.actionFooter, largeText && styles.inlineFooter]}>
      {primary}
      {status ? (
        <Copy accessibilityLiveRegion="polite" style={styles.status}>
          {status}
        </Copy>
      ) : null}
    </View>
  );
  return (
    <SafeAreaView testID="step-screen" style={s.page}>
      <View style={styles.stepTop}>
        {onBack ? (
          <IconButton icon={ArrowLeft} label="Previous step" tone="plain" onPress={onBack} />
        ) : (
          <View style={styles.spacer} />
        )}
        <View style={styles.stepMiddle}>
          {step !== null && <Progress step={step} total={total} />}
          {header}
        </View>
        <IconButton icon={X} label="Close" tone="plain" onPress={onClose} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          testID="step-scroll"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[s.body, { paddingBottom: 28 }]}
        >
          <Animated.View key={title} entering={entering} style={styles.stepBody}>
            <Text
              ref={titleRef}
              accessibilityRole="header"
              accessibilityHint={hint}
              style={[s.title, largeText && { lineHeight: undefined }]}
            >
              {title}
            </Text>
            {children}
          </Animated.View>
          {largeText && footer}
        </ScrollView>
        {!largeText && footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A bottom sheet for ⓘ explanations and short pickers. */
export function InfoSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const reduce = useReduceMotion();
  return (
    <Modal visible={visible} transparent animationType={reduce ? "fade" : "slide"} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessible={false} focusable={false} style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView edges={["bottom"]} style={styles.sheet} accessibilityViewIsModal aria-modal>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <View style={styles.sheetHeader}>
              <Text accessibilityRole="header" style={[s.title, styles.sheetTitle]}>
                {title}
              </Text>
              <IconButton icon={X} label="Close sheet" onPress={onClose} />
            </View>
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Moves VoiceOver (or browser focus) to a step's title after the step changes. */
export function focusHeading(target: Text | null) {
  if (!target) return;
  if (Platform.OS === "web") {
    const node = target as unknown as HTMLElement;
    node.setAttribute("tabindex", "-1");
    node.focus();
  } else AccessibilityInfo.sendAccessibilityEvent(target, "focus");
}

/** Announces a short message on iOS and Android. On the web, ErrorNote's alert role announces it. */
export function announce(message: string) {
  if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(message);
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: r.chip,
  },
  chipPressable: { minHeight: 44, paddingHorizontal: 14 },
  chipText: { fontSize: 13, flexShrink: 1 },
  tile: {
    minHeight: 64,
    padding: space.m,
    gap: 6,
    borderRadius: r.tile,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLarge: { minHeight: 96, padding: space.xl, boxShadow: depth.button },
  tileTitle: { fontFamily: fonts.medium, fontSize: 14, textAlign: "center" },
  tileTitleLarge: { fontFamily: fonts.display, fontSize: 22 },
  tileSubtitle: { fontSize: 12, color: c.muted, textAlign: "center" },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.pink,
    borderWidth: 1,
    borderColor: "#F8CBD0",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: depth.button,
  },
  badge: {
    minWidth: 52,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: c.surface,
    alignItems: "center",
  },
  badgeWeekday: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, color: "#963F58" },
  badgeDay: { fontFamily: fonts.display, fontSize: 22, color: c.ink },
  card: {
    borderRadius: r.card,
    overflow: "hidden",
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: "#EFEAF0",
    boxShadow: depth.card,
  },
  picture: { width: "100%", overflow: "hidden" },
  panel: { padding: space.l, gap: space.s },
  part: { minHeight: 44, borderRadius: 12, justifyContent: "center" },
  cardTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: c.ink },
  cardTitleHero: { fontSize: 28, lineHeight: 34 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: space.m },
  placeRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  stacked: { flexDirection: "column", alignItems: "flex-start" },
  cardLine: { flexShrink: 1, fontSize: 15 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  avatarRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: space.m, minHeight: 44 },
  avatars: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.aquaSoft,
    borderWidth: 2,
    borderColor: c.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 13, color: c.aquaDark },
  avatarExtra: { marginLeft: 6, fontSize: 13, color: c.muted },
  segmented: { flexDirection: "row", gap: 4, padding: 4, borderRadius: r.tile, backgroundColor: c.surface },
  segment: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: r.tile, alignItems: "center", justifyContent: "center" },
  segmentOn: { backgroundColor: c.paper, boxShadow: depth.small },
  segmentText: { fontSize: 14, color: c.muted, textAlign: "center" },
  segmentTextOn: { fontFamily: fonts.medium, color: c.ink },
  stepTop: { flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: space.m, paddingTop: space.s },
  stepMiddle: { flex: 1, alignItems: "center", gap: 6 },
  spacer: { width: 44 },
  stepBody: { gap: space.l },
  progress: { flexDirection: "row", gap: 6, width: "100%", maxWidth: 220 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: c.line },
  barOn: { backgroundColor: c.aquaDark },
  inlineFooter: { paddingHorizontal: 0, borderTopWidth: 0, backgroundColor: "transparent" },
  status: { fontSize: 11, color: c.muted, textAlign: "center" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(34, 30, 45, 0.25)" },
  sheet: { maxHeight: "85%", borderTopLeftRadius: r.card, borderTopRightRadius: r.card, backgroundColor: c.paper },
  sheetBody: { padding: space.xl, gap: space.l },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: space.m },
  sheetTitle: { flex: 1, fontSize: 24, lineHeight: 30 },
});
```

- [ ] **Step 4: Replace the preview bar with the Preview chip**

Replace `mobile/src/design/Chrome.tsx` with:
```tsx
import React, { useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { Eye } from "lucide-react-native";
import { Button, Copy } from "./ui";
import { Chip, InfoSheet } from "./kit";
import { useApp } from "../state/AppState";

/** Preview mode as a small header chip. Its sheet explains preview and offers Exit preview (spec "Preview mode"). */
export function PreviewNotice({ dismissible = true }: { dismissible?: boolean }) {
  const { preview, signOut } = useApp();
  const [open, setOpen] = useState(false);
  if (!preview) return null;
  return (
    <View style={{ alignSelf: "flex-start" }}>
      <Chip
        icon={Eye}
        tone="aqua"
        text="Preview"
        label="Preview mode"
        hint="Explains preview mode"
        onPress={() => setOpen(true)}
      />
      <InfoSheet visible={open} title="Preview" onClose={() => setOpen(false)}>
        <Copy>Actions stay on this device.</Copy>
        {dismissible && (
          <Button
            title="Exit preview"
            secondary
            onPress={async () => {
              setOpen(false);
              try {
                await signOut();
                router.replace("/");
              } catch {
                Alert.alert(
                  "Couldn’t leave preview",
                  "Please try again so local groups can be cleared.",
                );
              }
            }}
          />
        )}
      </InfoSheet>
    </View>
  );
}
```

- [ ] **Step 5: Add the development-only gallery**

`mobile/app/kit.tsx`:
```tsx
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarDays, Info, MapPin, Pencil } from "lucide-react-native";
import {
  AvatarStack,
  Chip,
  CoverCard,
  DateBadge,
  Fab,
  IconButton,
  InfoSheet,
  Segmented,
  StepScreen,
  Tile,
  type CardChip,
} from "../src/design/kit";
import { categoryIcons } from "../src/design/categories";
import { Button, Copy, Title, s } from "../src/design/ui";
import { cardLabel, reviewLabels } from "../src/domain/eventView";

/** Development-only gallery of the UX1 kit, exercised by scripts/verify-kit.mjs. */
export default function Kit() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Gallery />;
}

const startsAt = new Date(2099, 9, 10, 10, 0).toISOString();
const chips: CardChip[] = [
  { key: "hosting", text: "Hosting", tone: "aqua" },
  { key: "going", text: "3 going" },
];

function Gallery() {
  const [checked, setChecked] = useState(false);
  const [day, setDay] = useState(false);
  const [segment, setSegment] = useState<"upcoming" | "past">("upcoming");
  const [sheet, setSheet] = useState(false);
  const [step, setStep] = useState(false);
  const [pressed, setPressed] = useState("");
  const now = new Date();
  if (step)
    return (
      <StepScreen
        step={2}
        title="When?"
        hint="Required"
        onBack={() => setStep(false)}
        onClose={() => setStep(false)}
        status="Draft saved on this device."
        primary={<Button title="Next" onPress={() => setStep(false)} />}
      >
        <Copy>Step content sits here.</Copy>
      </StepScreen>
    );
  return (
    <SafeAreaView style={s.page}>
      <ScrollView testID="kit" contentContainerStyle={[s.body, { gap: 20 }]}>
        <Title>Kit</Title>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip text="Hosting" tone="aqua" />
          <Chip text="Natural" category="natural" icon={categoryIcons.natural} />
          <Chip
            text="Open in Maps"
            icon={MapPin}
            tone="aqua"
            label="Open Riverside park in Maps"
            onPress={() => setPressed("maps")}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Tile
              role="checkbox"
              title="Natural"
              category="natural"
              icon={categoryIcons.natural}
              selected={checked}
              onPress={() => setChecked(!checked)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Tile
              role="checkbox"
              title="Creative"
              category="creative"
              icon={categoryIcons.creative}
              disabled
              hint="Two categories are already chosen"
              onPress={() => {}}
            />
          </View>
        </View>
        <Tile
          title="Tomorrow"
          label="Tomorrow, Thursday 8 October"
          icon={CalendarDays}
          selected={day}
          onPress={() => setDay(!day)}
        />
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <IconButton icon={Pencil} label="Edit Picnic in the park" onPress={() => setPressed("edit")} />
          <IconButton icon={Info} label="About cover photos" onPress={() => setSheet(true)} />
          <DateBadge startsAt={startsAt} />
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Fab placement="float" onPress={() => setPressed("fab")} />
        </View>
        <Fab placement="inline" onPress={() => setPressed("fab")} />
        <CoverCard
          picture={{ kind: "placeholder", category: "natural" }}
          title="Picnic in the park"
          startsAt={startsAt}
          place="Riverside park"
          chips={chips}
          label={cardLabel(
            { title: "Picnic in the park", startsAt, place: "Riverside park", chips: chips.map((chip) => chip.text) },
            now,
          )}
          onPress={() => setPressed("card")}
        />
        <CoverCard
          picture={{ kind: "placeholder", category: "community" }}
          title="Picnic in the park"
          startsAt={startsAt}
          place="Riverside park"
          chips={[
            { key: "natural", text: "Natural", category: "natural" },
            { key: "community", text: "Community", category: "community" },
          ]}
          onPressPart={(part) => setPressed(part)}
          partLabels={reviewLabels(
            { title: "Picnic in the park", startsAt, place: "Riverside park", categories: ["natural", "community"] },
            now,
          )}
        />
        <AvatarStack names={["Alex", "Bea", "Cai", "Dee"]} label="4 going" onPress={() => setPressed("guests")} />
        <Segmented
          label="Show"
          options={[
            { key: "upcoming", text: "Upcoming" },
            { key: "past", text: "Past" },
          ] as const}
          value={segment}
          onChange={setSegment}
        />
        <Button title="Show step screen" secondary onPress={() => setStep(true)} />
        {pressed ? <Copy accessibilityLiveRegion="polite">{`Pressed ${pressed}`}</Copy> : null}
      </ScrollView>
      <InfoSheet visible={sheet} title="Cover photos" onClose={() => setSheet(false)}>
        <Copy>Only add photos you’re comfortable sharing with the people you invite.</Copy>
      </InfoSheet>
    </SafeAreaView>
  );
}
```

In `mobile/app/_layout.tsx`, add `<Stack.Screen name="kit" />` directly after `<Stack.Screen name="delete-account" />`, outside the protected groups.

- [ ] **Step 6: Run the checks**

Restart Expo web with `--clear`, which also regenerates the typed routes for `/kit`. Then run: `cd mobile && npm run check`
Expected: a clean typecheck, with 192 tests passing.

Run: `node scripts/verify-kit.mjs && node scripts/verify-planning.mjs && node scripts/verify-covers.mjs && node scripts/review-ui.mjs`
Expected:
- the `verify-kit` PASS line;
- the existing scripts still pass, because the Preview chip replaces only the bar and no other label changed;
- `review-ui.mjs` reports no console errors. Until Task 9 it reads only port 8081; if you used `--port 8082`, run it after Task 9 instead.

Open `/private/tmp/resbite-kit/kit-320.png` and `kit-large-320.png`: no clipped text, and the cards show the picture above a solid panel.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/design/kit.tsx mobile/src/design/tokens.ts mobile/src/design/ui.tsx mobile/src/design/categories.tsx mobile/src/design/Chrome.tsx mobile/app/kit.tsx mobile/app/_layout.tsx mobile/scripts/verify-kit.mjs
git commit -m "Add the UX1 component kit, the Preview chip and a development kit gallery

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Extract `usePlanEditor` (pure refactor, no visual change)

**Files:**
- Create: `mobile/src/state/usePlanEditor.ts`
- Modify: `mobile/app/arrange.tsx` (logic removed; render unchanged apart from six substitutions)

**Interfaces:**
- Consumes: everything `arrange.tsx` uses today, including Task 2's `recentPlaces` and `captureSession`.
- Produces: `usePlanEditor({ activity?: string; plan?: string }): PlanEditor` and `type PlanEditorMode = "edit" | "idea" | "blank"`. Tasks 5 to 7 consume this exact shape:

```ts
export type PlanEditor = {
  mode: PlanEditorMode;
  preview: boolean;
  /** "preview" or the signed-in account id; undefined while signed out. */
  scope: string | undefined;
  catalogue: ReturnType<typeof useCatalogue>;
  idea: Activity | undefined;
  historicalActivity: Activity | undefined;
  /** The idea this event comes from, or null for a blank event. */
  sourceId: string | null;
  original: LocalPlan | null;
  /** An idea that must be re-checked before a new event can use it. */
  ideaBlocked: boolean;
  loading: boolean;
  preparing: boolean;
  /** The draft, plan or idea has loaded and the fields can be shown. */
  ready: boolean;
  /** A draft from this device was restored when the editor opened. */
  restored: boolean;
  retryLoad: () => void;
  fields: EventFields;
  setFields: (next: EventFields) => void;
  start: string;
  setStart: (next: string) => void;
  place: string;
  /** Typing or choosing a place; a running "Use my location" then never overwrites it. */
  changePlace: (next: string) => void;
  note: string;
  setNote: (next: string) => void;
  zone: string;
  dirty: boolean;
  locked: boolean;
  busy: boolean;
  locating: boolean;
  saved: boolean;
  error: string | null;
  latest: LocalPlan | null | undefined;
  latestEditable: boolean;
  pending: PlanWrite | null;
  draftStatus: string;
  draftError: string | null;
  draftRetryLabel: "Retry keeping draft" | "Try again";
  cover: CoverControls;
  save: () => Promise<void>;
  locate: () => Promise<void>;
  discardDraft: () => void;
  retryDraft: () => void;
  applyPlan: (plan: LocalPlan) => void;
};
```

The hook body is `arrange.tsx`'s code, moved verbatim. The only additions are the `restored` flag, its two setters, and the return object (which also absorbs the inline draft-retry handler). Review the move with `git diff --color-moved=zebra`: moved blocks must show as moved, not edited.

- [ ] **Step 1: Confirm the gate is green before moving anything**

Start Expo web (`--clear`), then run `cd mobile && npm run check && node scripts/verify-planning.mjs && node scripts/verify-covers.mjs && node scripts/verify-catalogue.mjs && node scripts/verify-people.mjs`.
Expected: everything passes. These four scripts are this task's test; they must pass again afterwards without any edit.

- [ ] **Step 2: Create the hook with the moved code**

`mobile/src/state/usePlanEditor.ts`:
```ts
import { useEffect, useRef, useState } from "react";
import { AppState, Alert, Keyboard, Platform } from "react-native";
import { router } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { activities } from "../services/catalogue";
import { useCatalogue } from "./useCatalogue";
import { drafts, type PlanDraft } from "../services/drafts";
import { planGateway } from "../services/plans";
import { recentPlaces } from "../services/recentPlaces";
import { useApp, type LocalPlan } from "./AppState";
import { useCoverPhoto, type CoverControls, type CoverOutcome } from "./useCoverPhoto";
import {
  completeEventFields,
  fieldsFromActivity,
  legacyEventFields,
  validateEventFields,
  type EventFields,
} from "../domain/events";
import { draftAutosaveAction } from "../domain/draftAutosave";
import { validatePlan, type Activity } from "../domain/rules";
import {
  canEditPlan,
  localDateTime,
  parseLocalDateTime,
  PlanSaveError,
  writePlan,
  reconcilePlan,
  type PlanWrite,
} from "../domain/plans";

export type PlanEditorMode = "edit" | "idea" | "blank";
// The comments on each field are in this task's Interfaces block.
export type PlanEditor = {
  mode: PlanEditorMode;
  preview: boolean;
  scope: string | undefined;
  catalogue: ReturnType<typeof useCatalogue>;
  idea: Activity | undefined;
  historicalActivity: Activity | undefined;
  sourceId: string | null;
  original: LocalPlan | null;
  ideaBlocked: boolean;
  loading: boolean;
  preparing: boolean;
  ready: boolean;
  restored: boolean;
  retryLoad: () => void;
  fields: EventFields;
  setFields: (next: EventFields) => void;
  start: string;
  setStart: (next: string) => void;
  place: string;
  changePlace: (next: string) => void;
  note: string;
  setNote: (next: string) => void;
  zone: string;
  dirty: boolean;
  locked: boolean;
  busy: boolean;
  locating: boolean;
  saved: boolean;
  error: string | null;
  latest: LocalPlan | null | undefined;
  latestEditable: boolean;
  pending: PlanWrite | null;
  draftStatus: string;
  draftError: string | null;
  draftRetryLabel: "Retry keeping draft" | "Try again";
  cover: CoverControls;
  save: () => Promise<void>;
  locate: () => Promise<void>;
  discardDraft: () => void;
  retryDraft: () => void;
  applyPlan: (plan: LocalPlan) => void;
};

/**
 * All of the plan editor's state and behaviour: draft restore and autosave, the
 * leave guard, the cover hook, validation, save, pending writes, reconciliation and
 * post-save routing. Moved unchanged from app/arrange.tsx (UX1); screens only render.
 */
export function usePlanEditor({
  activity,
  plan: planId,
}: {
  activity?: string;
  plan?: string;
}): PlanEditor {
  const { preview, session, localPlans, setLocalPlans, captureSession } = useApp();
  const navigation = useNavigation();
  const requestId = useRef(Crypto.randomUUID());
  const saving = useRef(false);
  const mounted = useRef(true);
  const placeRevision = useRef(0);
  const [original, setOriginal] = useState<LocalPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [start, setStart] = useState(() =>
    localDateTime(new Date(Date.now() + 86400000)),
  );
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [fields, setFields] = useState<EventFields>({
    title: "",
    description: "",
    categories: [],
  });
  const needsPrefill = useRef(false);
  const coverOutcome = useRef<CoverOutcome>("none");
  const cover = useCoverPhoto({
    planId: planId ?? null,
    preview,
    previewUri: preview && planId ? (localPlans.find((p) => p.id === planId)?.cover_path ?? null) : null,
    onPreviewChange: (uri) => {
      if (planId)
        setLocalPlans((all) => all.map((p) => (p.id === planId ? { ...p, cover_path: uri } : p)));
    },
  });
  const [initial, setInitial] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<LocalPlan | null | undefined>(undefined);
  const [pending, setPending] = useState<PlanWrite | null>(null);
  const [saved, setSaved] = useState(false);
  const [zone, setZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const scope = preview ? "preview" : session?.user.id;
  const draftKey = planId
    ? `edit-${planId}`
    : activity
      ? `new-${activity}`
      : "new";
  const [draftStatus, setDraftStatus] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  // UX1: a restored draft opens at Review when complete, else at its first missing step.
  const [restored, setRestored] = useState(false);
  const stopped = useRef(false);
  const discarded = useRef(false);
  const draftSnapshot = useRef<PlanDraft | null>(null);
  // A draft was written or restored in this editor session; counts writes so a removal never outlives a newer put.
  const persisted = useRef(false);
  const draftWrites = useRef(0);
  const mode: "edit" | "idea" | "blank" = planId
    ? "edit"
    : activity
      ? "idea"
      : "blank";
  const catalogue = useCatalogue(activity ?? "", mode === "idea");
  const sourceId = original ? original.activity_id : (activity ?? null);
  const historicalActivity = sourceId
    ? activities.find((x) => x.id === sourceId)
    : undefined;
  // A new event from an idea needs its current publication; edits and unconfirmed saves do not.
  const idea =
    mode === "idea" && !preview && !pending
      ? catalogue.items[0]
      : (catalogue.items[0] ?? historicalActivity);
  const snapshotOf = (f: EventFields, s: string, p: string, n: string) =>
    JSON.stringify([f.title, f.description, f.categories, s, p, n]);
  const dirty =
    initial !== null && initial !== snapshotOf(fields, start, place, note);
  const locked = busy || pending !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
```
Continue the file with the following blocks from `mobile/app/arrange.tsx`, copied **verbatim and in order** (they sit at the same indentation in both files):
1. From `  function applyPlan(plan: LocalPlan) {` through the closing `}` of `async function save()`. This includes:
   - the load and restore effect;
   - the prefill effect, `draftSnapshot`, `keepDraft`, `removeDraft` and `dueRemoval`;
   - the autosave and AppState effects;
   - `usePreventRemove`, the post-save `router.dismissTo` effect, `discardDraft`, `locate` and `save`, including Task 2's `recentPlaces.remember` lines.

   Make exactly two additions inside the load and restore effect:
   - after `    persisted.current = false;` (the line after `stopped.current = false;`), add `    setRestored(false);`;
   - after `          persisted.current = true;` (the first line inside `if (stored) {`), add `          setRestored(true);`.
2. Then close the hook with:
```ts
  const latestEditable = latest ? canEditPlan(latest, session?.user.id, preview) : false;
  // The draft-error retry, moved verbatim from arrange.tsx's inline onPress.
  function retryDraft() {
    const action = draftAutosaveAction({
      dirty,
      pending,
      persisted: persisted.current,
    });
    if (action === "skip") {
      setDraftError(null);
      setDraftStatus("");
      return;
    }
    if (action === "remove") {
      void removeDraft()
        .then(() => {
          setDraftError(null);
          setDraftStatus("");
        })
        .catch(() => {});
      return;
    }
    void keepDraft()
      .then(() => {
        setDraftError(null);
        setDraftStatus("Draft saved on this device.");
      })
      .catch(() => {});
  }
  return {
    mode,
    preview,
    scope,
    catalogue,
    idea,
    historicalActivity,
    sourceId,
    original,
    ideaBlocked:
      mode === "idea" &&
      !preview &&
      !pending &&
      (catalogue.loading || Boolean(catalogue.error) || !idea),
    loading,
    preparing: loading || (initial === null && needsPrefill.current),
    ready: !loading && draftReady && initial !== null && !(planId && !original),
    restored,
    retryLoad: () => setLoadAttempt((n) => n + 1),
    fields,
    setFields,
    start,
    setStart,
    place,
    changePlace: (text: string) => {
      placeRevision.current++;
      setPlace(text);
    },
    note,
    setNote,
    zone,
    dirty,
    locked,
    busy,
    locating,
    saved,
    error,
    latest,
    latestEditable,
    pending,
    draftStatus,
    draftError,
    draftRetryLabel:
      draftAutosaveAction({ dirty, pending, persisted: persisted.current }) === "write"
        ? "Retry keeping draft"
        : "Try again",
    cover,
    save,
    locate,
    discardDraft,
    retryDraft,
    applyPlan,
  };
}
```

- [ ] **Step 3: Leave only rendering in `arrange.tsx`**

In `mobile/app/arrange.tsx`, replace everything from the first line through the closing `}` of `async function save()` (the line just before `  if (\n    mode === "idea" &&`) with:
```tsx
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { MapPin, MessageCircle, CalendarDays } from "lucide-react-native";
import {
  Back,
  Button,
  Copy,
  Title,
  Field,
  ErrorNote,
  useReduceMotion,
  s,
} from "../src/design/ui";
import { PreviewNotice } from "../src/design/Chrome";
import { EventDetailsFields } from "../src/design/EventDetailsFields";
import { EventPictureView } from "../src/design/categories";
import { CoverPicker } from "../src/design/CoverPicker";
import { eventPicture } from "../src/domain/events";
import { PlanSchedule } from "../src/design/PlanSchedule";
import { colors as c } from "../src/design/tokens";
import { usePlanEditor } from "../src/state/usePlanEditor";

export default function Arrange() {
  const { activity, plan: planId } = useLocalSearchParams<{
    activity?: string;
    plan?: string;
  }>();
  const {
    mode,
    preview,
    catalogue,
    idea,
    historicalActivity,
    sourceId,
    ideaBlocked,
    preparing,
    ready,
    retryLoad,
    fields,
    setFields,
    start,
    setStart,
    place,
    changePlace,
    note,
    setNote,
    zone,
    dirty,
    locked,
    busy,
    locating,
    error,
    latest,
    latestEditable,
    pending,
    draftStatus,
    draftError,
    draftRetryLabel,
    cover,
    save,
    locate,
    discardDraft,
    retryDraft,
    applyPlan,
  } = usePlanEditor({ activity, plan: planId });
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.4;
  const scroll = useRef<ScrollView>(null);
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollToEnd({ animated: !reduceMotion }),
    );
    return () => cancelAnimationFrame(frame);
  }, [error, latest, reduceMotion]);
```
Then make these six substitutions in the remaining render code, and change nothing else:
1. Replace
```tsx
  if (
    mode === "idea" &&
    !preview &&
    !pending &&
    (catalogue.loading || catalogue.error || !idea)
  )
```
with `  if (ideaBlocked)`.
2. Replace
```tsx
  const preparing = loading || (initial === null && needsPrefill.current);
  if (loading || !draftReady || initial === null || (planId && !original))
```
with `  if (!ready)`.
3. Replace `onPress={() => setLoadAttempt((n) => n + 1)}` with `onPress={retryLoad}`.
4. Replace
```tsx
              onChangeText={(text) => {
                placeRevision.current++;
                setPlace(text);
              }}
```
with `              onChangeText={changePlace}`.
5. Replace the whole `{draftError && ( <Button title={…} secondary onPress={() => { … }} /> )}` block with:
```tsx
          {draftError && (
            <Button title={draftRetryLabel} secondary onPress={retryDraft} />
          )}
```
6. Replace `{canEditPlan(latest, session?.user.id, preview) ? (` with `{latestEditable ? (`.

- [ ] **Step 4: Run the gate unchanged**

Run: `cd mobile && npm run check`
Expected: a clean typecheck, with 192 tests passing.

Restart Expo web with `--clear`, then run `node scripts/verify-planning.mjs && node scripts/verify-covers.mjs && node scripts/verify-catalogue.mjs && node scripts/verify-people.mjs`.
Expected: every PASS line, with `git diff --stat mobile/scripts` empty.

Run: `git diff --color-moved=zebra mobile/app/arrange.tsx mobile/src/state/usePlanEditor.ts | less -R`
Expected: the moved blocks are coloured as moved. The only new lines are the imports, the type, the `restored` state and its two setters, the arrange.tsx destructuring and the return object.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/state/usePlanEditor.ts mobile/app/arrange.tsx
git commit -m "Move the plan editor's logic into usePlanEditor without changing the screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Creation steps, Review and the Invite screen

**Files:**
- Create: `mobile/src/design/PlanSteps.tsx`, `mobile/scripts/qa-helpers.mjs`, `mobile/scripts/verify-steps.mjs`
- Replace: `mobile/app/arrange.tsx`, `mobile/src/design/CoverPicker.tsx`
- Modify: `mobile/src/state/usePlanEditor.ts` (`created`), `mobile/src/design/PlanSchedule.tsx` (controlled picker), `mobile/src/design/categories.tsx` (remove `CategoryChoices`), `mobile/scripts/verify-planning.mjs`, `mobile/scripts/verify-covers.mjs`, `mobile/scripts/verify-catalogue.mjs`, `mobile/scripts/verify-people.mjs`
- Delete: `mobile/src/design/EventDetailsFields.tsx` (no longer used)

**Interfaces:**
- Consumes:
  - Task 1: `entryStep`, `firstMissingStep`, `nextStep`, `previousStep`, `stepNumber`, `stepProblem`, `Step`, `StepAnswers`, `quickDays`, `quickTimes`, `splitLocal`, `joinLocal`, `shortDay`, `spokenDate`, `reviewLabels`, `coverNotice` and `CoverCardPart`;
  - Task 2: `recentPlaces.list`;
  - Task 3: `StepScreen`, `Chip`, `Tile`, `CoverCard`, `IconButton`, `InfoSheet`, `focusHeading` and `announce`;
  - Task 4: `usePlanEditor` and `PlanEditor`.
- Produces:
  - `PlanEditor.created: { planId: string; cover: CoverOutcome } | null`;
  - `PlanSchedule` props `picker?: "date" | "time" | null`, `onPickerClose?: () => void` and `buttons?: boolean`;
  - `CoverPicker({ cover, fallback, disabled? })` and `CoverRecovery({ cover, disabled? })`;
  - `PlanSteps.tsx`: `STEP_TITLES`, `STEP_HINTS`, `WhatStep`, `WhenStep`, `WhereStep`, `VibeStep`, `ReviewStep`, `InviteNext` and `DraftProblems`;
  - `scripts/qa-helpers.mjs`: `visible`, `heading`, `button`, `next`, `close`, `typeDate`, `createSteps`, `createFromIdea`, `later`, `editEvent`, `inviteFromList`, `cancelFromList`, `expectCancelled`, `choosePeople`, `closeToList` and `expectCategories`. Task 7 replaces the list helpers.
- Visible strings and labels introduced (exact):
  - Step titles: "What’s the plan?", "When?", "Where?", "What’s the vibe?", "Looks good?" and "It’s on!".
  - Progress: "Step N of 4". Navigation: "Previous step" and "Close". Pill: "Next", or "Done" when returning to Review.
  - Review pill:
    - "Create", or "Save" when editing;
    - in preview, "Create preview" and "Save preview";
    - "Retry save" while a save is unconfirmed.
  - Review parts:
    - "Edit photo";
    - "Edit name, …", "Edit date and time, …", "Edit place, …" and "Edit vibe, …";
    - "Add description" (chip text "Description"), plus the idea chip labelled "From the idea …".
  - When:
    - day tiles "Today, …", "Tomorrow, …", the weekend label, and "Pick a day" (title "Pick");
    - time chips, labelled as full phrases;
    - "Other time" (chip "⋯");
    - the zone chip, labelled "Times shown in …".
  - Where: "Use my location" (chip "Current location", or "Finding you…" while locating) and "Use recent place …".
  - What: "Add cover photo", "Change cover photo", "Remove cover photo" and "About cover photos" (sheet "Cover photos").
  - Invite screen: "Invite people" and "Later".

- [ ] **Step 1: Write the shared QA helpers and the failing step checks**

`mobile/scripts/qa-helpers.mjs`:
```js
// Shared browser QA steps for the UX1 creation flow and My resbites.
// Task 7 swaps the list helpers below from the inline card actions to the event page.
import { expect } from "@playwright/test";

/** Ignores matches on screens hidden underneath in the stack. */
export const visible = (locator) => locator.filter({ visible: true });
export const heading = (page, name) => visible(page.getByRole("heading", { name, exact: true }));
export const button = (page, name) =>
  visible(page.getByRole("button", { name, exact: typeof name === "string" }));

/** The step pill: "Next" going forward, "Done" when returning to Review. */
export async function next(page) {
  await button(page, /^(Next|Done)$/).click();
}
export async function close(page) {
  await button(page, "Close").click();
}
/** Web QA types dates into "Date and time (local)", behind the Pick tile. */
export async function typeDate(page, value) {
  await button(page, /^Pick a day/).click();
  await page.getByLabel("Date and time (local)", { exact: true }).fill(value);
}
/** What → When → Where → Vibe → Review for a new event. */
export async function createSteps(page, { name, when, place, note, categories = [] }) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await next(page);
  if (when) await typeDate(page, when);
  await next(page);
  await page.getByLabel("Meeting place", { exact: true }).fill(place);
  if (note) await page.getByLabel("A note for everyone (optional)", { exact: true }).fill(note);
  await next(page);
  for (const category of categories) await page.getByRole("checkbox", { name: category, exact: true }).click();
  await next(page);
  await expect(heading(page, "Looks good?")).toBeVisible();
}
/** An idea opens at Review. Create jumps to the missing place, then Done returns to Review. */
export async function createFromIdea(page, place, submit = "Create preview") {
  await expect(heading(page, "Looks good?")).toBeVisible();
  await button(page, submit).click();
  await expect(page.getByText("Add a meeting place.", { exact: true })).toBeVisible();
  await page.getByLabel("Meeting place", { exact: true }).fill(place);
  await next(page);
  await button(page, submit).click();
}
/** The Invite screen after creating, then "Later" back to My resbites. */
export async function later(page) {
  await expect(heading(page, "It’s on!")).toBeVisible();
  await button(page, "Later").click();
}

// --- My resbites helpers (inline card actions; Task 7 moves them to the event page) ---
export async function editEvent(page, title) {
  await button(page, "Edit plan").first().click();
  await expect(heading(page, "Looks good?")).toBeVisible();
}
export async function inviteFromList(page, title, notice) {
  await button(page, "Invite someone").first().click();
  await expect(page.getByText(notice, { exact: false })).toBeVisible();
}
export async function cancelFromList(page, title) {
  await button(page, "Cancel plan").first().click();
  await button(page, "Yes, cancel plan").click();
}
export async function expectCancelled(page, title) {
  await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
  await expect(button(page, "Edit plan")).toHaveCount(0);
}
export async function choosePeople(page, title) {
  await button(page, "Choose people").first().click();
}
/** Leaves an unchanged editor and returns to My resbites. */
export async function closeToList(page) {
  await close(page);
}
/** The categories a card shows, for example "Natural · Community". */
export async function expectCategories(page, title, text) {
  const card = page
    .getByText(title, { exact: true })
    .locator('xpath=ancestor::div[contains(., "YOU’RE ORGANISING")][1]');
  await expect(card.getByText(text, { exact: true })).toBeVisible();
}
```

`mobile/scripts/verify-steps.mjs`:
```js
// UX1 creation steps in preview: Next with a missing answer, alerts and focus, quick day and
// time tiles, jumping from Review, the Invite screen, leaving mid-flow, a restored
// unconfirmed save, recent places, and Larger Text at 320 px. Every Supabase request is aborted.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { button, close, createSteps, heading, later, next } from "./qa-helpers.mjs";
const baseURL = process.env.RESBITE_QA_URL || "http://localhost:8081";
const shots = "/private/tmp/resbite-steps";
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const errors = [];
async function preview({ width = 390, query = "", time } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    timezoneId: "Europe/London",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  if (time) await page.clock.setFixedTime(time);
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.goto(`${baseURL}/${query}`);
  await page.getByText("Preview the design", { exact: true }).click();
  await page.getByRole("tab", { name: "My resbites", exact: true }).click();
  return page;
}
try {
  // 1. Next with a missing answer stays, shows the step's own wording in an alert, and
  //    focus follows every step change. 2. Review parts jump to a step and Done comes back.
  //    3. Create shows the Invite screen.
  {
    const page = await preview();
    await button(page, "New resbite").click();
    await expect(page.getByRole("progressbar", { name: "Step 1 of 4", exact: true })).toBeVisible();
    await next(page);
    await expect(page.getByRole("alert")).toContainText("Give your resbite a name.");
    await expect(heading(page, "What’s the plan?")).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill("Garden picnic");
    await next(page);
    await expect(heading(page, "When?")).toBeFocused();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await button(page, "Previous step").click();
    await expect(heading(page, "What’s the plan?")).toBeFocused();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Garden picnic");
    await next(page);
    await next(page);
    await expect(heading(page, "Where?")).toBeFocused();
    await next(page);
    await expect(page.getByRole("alert")).toContainText("Add a meeting place.");
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await next(page);
    await next(page);
    await expect(page.getByRole("alert")).toContainText("Choose one or two categories.");
    await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Natural", exact: true })).toBeChecked();
    await next(page);
    await expect(heading(page, "Looks good?")).toBeFocused();
    await button(page, "Edit place, Riverside park").click();
    await expect(heading(page, "Where?")).toBeVisible();
    await page.getByLabel("Meeting place", { exact: true }).fill("Old mill");
    await button(page, "Done").click();
    await expect(button(page, "Edit place, Old mill")).toBeVisible();
    await button(page, "Create preview").click();
    await expect(heading(page, "It’s on!")).toBeFocused();
    await button(page, "Invite people").click();
    await expect(page).toHaveURL(/\/invitations\?plan=/);
    await page.context().close();
    console.log("PASS: Next with a missing answer, alerts, focus on step change, jump from Review, Invite screen.");
  }

  // 4. Quick tiles with a fixed clock: Friday 9 October 2026 at 10:30 in London.
  {
    const page = await preview({ time: new Date("2026-10-09T10:30:00+01:00") });
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Brunch");
    await next(page);
    await expect(button(page, "Today, Friday 9 October")).toBeVisible();
    // Tomorrow is Saturday, so the weekend tile is Sunday.
    await expect(button(page, "Sunday 11 October")).toBeVisible();
    await button(page, "Today, Friday 9 October").click();
    await expect(button(page, "Friday 9 October at 10:00")).toBeDisabled();
    await expect(button(page, "Friday 9 October at 13:00")).toBeEnabled();
    await button(page, "Friday 9 October at 13:00").click();
    await button(page, /^Pick a day/).click();
    await expect(page.getByLabel("Date and time (local)", { exact: true })).toHaveValue("2026-10-09 13:00");
    await button(page, "Tomorrow, Saturday 10 October").click();
    await expect(page.getByLabel("Date and time (local)", { exact: true })).toHaveValue("2026-10-10 13:00");
    await expect(button(page, "Saturday 10 October at 09:00")).toBeEnabled();
    await page.context().close();
    console.log("PASS: quick day tiles, the weekend rule, past times disabled, local YYYY-MM-DD HH:mm value.");
  }

  // 5. Leaving mid-flow runs the existing keep-draft guard; a kept draft resumes at its first missing step.
  {
    const page = await preview();
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Book swap");
    await next(page);
    await next(page);
    await expect(page.getByText("Draft saved on this device.", { exact: true })).toBeVisible();
    page.once("dialog", (dialog) => dialog.dismiss());
    await close(page);
    await expect(heading(page, "Where?")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await close(page);
    await button(page, /^Continue draft/).click();
    await expect(heading(page, "Where?")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Step 3 of 4", exact: true })).toBeVisible();
    await page.context().close();
    console.log("PASS: Close runs the keep-draft guard; a kept draft resumes at its first missing step.");
  }

  // 6. A restored unconfirmed save opens at Review, locked, offering Retry save.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*.supabase.co/**", (route) => route.abort());
    await page.addInitScript(() => {
      const id = "33333333-3333-4333-8333-333333333333";
      const details = {
        title: "Old picnic",
        description: "",
        categories: ["natural"],
        starts_at: "2020-01-01T09:00:00.000Z",
        time_zone: "UTC",
        place_label: "Old park",
        note: "",
      };
      sessionStorage.setItem(
        "resbite.drafts.v1.preview",
        JSON.stringify([
          {
            schema: 1,
            scope: "preview",
            key: "new",
            activityId: null,
            requestId: id,
            original: null,
            initial: JSON.stringify(["", "", [], "", "", ""]),
            title: "Old picnic",
            description: "",
            categories: ["natural"],
            start: "2020-01-01 09:00",
            place: "Old park",
            note: "",
            zone: "UTC",
            pending: { id, activityId: null, details },
            updatedAt: new Date().toISOString(),
          },
        ]),
      );
    });
    await page.goto(baseURL);
    await page.getByText("Preview the design", { exact: true }).click();
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await button(page, /^Continue draft/).click();
    await expect(heading(page, "Looks good?")).toBeVisible();
    await expect(button(page, "Retry save")).toBeVisible();
    await expect(page.getByText("Unconfirmed save restored. Check and retry to finish.", { exact: true })).toBeVisible();
    await button(page, "Edit name, Old picnic").click();
    await expect(page.getByLabel("Name", { exact: true })).not.toBeEditable();
    await context.close();
    console.log("PASS: a restored unconfirmed save opens at Review with fields locked and Retry save.");
  }

  // 7. Recent places: a saved place is offered next time.
  {
    const page = await preview();
    await button(page, "New resbite").click();
    await createSteps(page, { name: "Picnic", place: "Riverside park", categories: ["Natural"] });
    await button(page, "Create preview").click();
    await later(page);
    await button(page, "New resbite").click();
    await page.getByLabel("Name", { exact: true }).fill("Second picnic");
    await next(page);
    await next(page);
    await button(page, "Use recent place Riverside park").click();
    await expect(page.getByLabel("Meeting place", { exact: true })).toHaveValue("Riverside park");
    await page.context().close();
    console.log("PASS: a saved place is offered as a recent place chip.");
  }

  // 8. Larger Text at 320 px: every step fits without sideways scrolling and keeps its pill inline.
  {
    const page = await preview({ width: 320, query: "?largeText=1" });
    await page.addStyleTag({ content: '[dir="auto"] { zoom: 1.4; }' });
    const fits = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="step-screen"] *')].every((el) => {
          const box = el.getBoundingClientRect();
          return box.width === 0 || (box.left >= -1 && box.right <= window.innerWidth + 1);
        }),
      );
    const inline = () =>
      page.evaluate(() =>
        document.querySelector('[data-testid="step-scroll"]').contains(document.querySelector('[data-testid="step-primary"]')),
      );
    await button(page, "New resbite").click();
    const steps = [
      ["What’s the plan?", () => page.getByLabel("Name", { exact: true }).fill("A long name for a very relaxed afternoon")],
      ["When?"],
      ["Where?", () => page.getByLabel("Meeting place", { exact: true }).fill("The community garden behind the old library")],
      ["What’s the vibe?", () => page.getByRole("checkbox", { name: "Community", exact: true }).click()],
      ["Looks good?"],
    ];
    for (const [title, fill] of steps) {
      await expect(heading(page, title)).toBeVisible();
      if (fill) await fill();
      assert.equal(await fits(), true, `${title} fits 320 px with Larger Text`);
      assert.equal(await inline(), true, `${title} keeps its pill inline under Larger Text`);
      await page.screenshot({ path: `${shots}/${steps.findIndex((s) => s[0] === title) + 1}-large-320.png`, fullPage: true });
      if (title !== "Looks good?") await next(page);
    }
    await page.context().close();
    console.log("PASS: Larger Text at 320 px on every step: no sideways overflow, inline pill.");
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
```

Start Expo web (`--clear`), then run: `cd mobile && node scripts/verify-steps.mjs`
Expected: FAIL waiting for the progress bar named "Step 1 of 4".

- [ ] **Step 2: Show the Invite screen after a create**

In `mobile/src/state/usePlanEditor.ts`:
1. In `type PlanEditor`, add after `saved: boolean;`:
```ts
  /** Set when a new event is created; the editor then shows the Invite screen. */
  created: { planId: string; cover: CoverOutcome } | null;
```
2. After `  const coverOutcome = useRef<CoverOutcome>("none");`, add:
```ts
  const createdId = useRef<string | null>(null);
  const [created, setCreated] = useState<{ planId: string; cover: CoverOutcome } | null>(null);
```
3. Replace the post-save effect (the one that calls `router.dismissTo` with `created: !discarded.current && !planId ? "1" : "0"`) with:
```ts
  useEffect(() => {
    if (!saved) return;
    // UX1: a new event shows the Invite screen (benchmark row 1), whose "Later" dismisses
    // to My resbites with created=1. Edits and discards route exactly as before.
    if (!discarded.current && !planId && createdId.current) {
      setCreated({ planId: createdId.current, cover: coverOutcome.current });
      return;
    }
    router.dismissTo({
      pathname: "/plans",
      params: {
        created: "0",
        updated: !discarded.current && planId ? "1" : "0",
        cover: coverOutcome.current,
      },
    });
  }, [saved, planId]);
```
4. In `save()`, directly after `      if (!preview && !original) coverOutcome.current = await cover.commitAfterCreate(write.id);`, add `      if (!original) createdId.current = write.id;`.
5. In the returned object, add `created,` after `saved,`.

- [ ] **Step 3: Let the When step open the native picker directly**

In `mobile/src/design/PlanSchedule.tsx`:
- Change `import React, { useState } from "react";` to `import React, { useEffect, useState } from "react";`.
- Replace the props and the first state line:
```tsx
export function PlanSchedule({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<"date" | "time" | null>(null);
```
with:
```tsx
export function PlanSchedule({
  value,
  onChange,
  disabled,
  picker,
  onPickerClose,
  buttons = true,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  /** Controlled mode (UX1 When step): the parent opens the picker sheet. */
  picker?: "date" | "time" | null;
  onPickerClose?: () => void;
  /** Show the Date and Time buttons (native only). */
  buttons?: boolean;
}) {
  const [ownMode, setOwnMode] = useState<"date" | "time" | null>(null);
  const controlled = picker !== undefined;
  const mode = controlled ? picker : ownMode;
  const setMode = (next: "date" | "time" | null) => {
    if (!controlled) setOwnMode(next);
    else if (next === null) onPickerClose?.();
  };
```
- Directly after `  const date = parseLocalDateTime(value);`, add:
```tsx
  // A parent-opened picker starts from the current value, as open() does.
  useEffect(() => {
    if (!controlled || !picker) return;
    Keyboard.dismiss();
    setCandidate(parseLocalDateTime(value) ?? new Date(Date.now() + 86400000));
  }, [controlled, picker]);
```
- Wrap the existing `<View style={styles.controls}> … </View>` in `{buttons && ( … )}`. The web branch is unchanged: it always renders the "Date and time (local)" field.

- [ ] **Step 4: Turn the cover controls into the photo tile**

Replace `mobile/src/design/CoverPicker.tsx` with:
```tsx
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Camera, Info, Trash2 } from "lucide-react-native";
import { Button, Copy } from "./ui";
import { IconButton, InfoSheet } from "./kit";
import { EventPictureView } from "./categories";
import { colors as c, r } from "./tokens";
import type { EventPicture } from "../domain/events";
import type { CoverControls } from "../state/useCoverPhoto";

const PRIVACY = "Only add photos you’re comfortable sharing with the people you invite.";

/**
 * The What step's photo tile (CE2 actions, UX1 look). Add and Change open the system
 * picker directly, so iOS never presents it from a closing sheet; ⓘ explains privacy.
 */
export function CoverPicker({
  cover,
  fallback,
  disabled,
}: {
  cover: CoverControls;
  fallback: EventPicture;
  disabled?: boolean;
}) {
  const [about, setAbout] = useState(false);
  const blocked = Boolean(disabled) || cover.busy || !cover.ready;
  return (
    <View style={styles.wrap}>
      {cover.pending ? (
        <CoverRecovery cover={cover} disabled={disabled} />
      ) : (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cover.uri ? "Change cover photo" : "Add cover photo"}
            accessibilityHint={PRIVACY}
            aria-disabled={blocked}
            aria-busy={cover.busy}
            disabled={blocked}
            onPress={() => void cover.choose()}
            style={({ pressed }) => [styles.tile, { opacity: blocked ? 0.55 : pressed ? 0.8 : 1 }]}
          >
            {cover.uri ? (
              <Image source={{ uri: cover.uri }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
            ) : (
              <View style={styles.empty}>
                <EventPictureView picture={fallback} size={64} />
                <Camera size={22} strokeWidth={1.7} color={c.aquaDark} />
              </View>
            )}
          </Pressable>
          <View style={styles.side}>
            {!!cover.uri && (
              <IconButton icon={Trash2} label="Remove cover photo" disabled={blocked} onPress={() => void cover.remove()} />
            )}
            <IconButton icon={Info} label="About cover photos" onPress={() => setAbout(true)} />
          </View>
        </View>
      )}
      {!!cover.message && (
        <Copy style={styles.hint} accessibilityLiveRegion="polite">
          {cover.message}
        </Copy>
      )}
      <InfoSheet visible={about} title="Cover photos" onClose={() => setAbout(false)}>
        <Copy>{PRIVACY}</Copy>
      </InfoSheet>
    </View>
  );
}

/** Pending-cover recovery, in its CE2 wording; shown on What and on Review. */
export function CoverRecovery({ cover, disabled }: { cover: CoverControls; disabled?: boolean }) {
  const blocked = Boolean(disabled) || cover.busy || !cover.ready;
  return (
    <>
      <Copy>A cover change needs confirmation. Retry checks the saved cover before changing anything.</Copy>
      <Button title="Keep saved cover" secondary onPress={() => void cover.keep()} disabled={blocked} />
      <Button title="Retry cover" secondary onPress={() => void cover.retry()} disabled={blocked} loading={cover.busy} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  tile: {
    flex: 1,
    height: 168,
    borderRadius: r.tile,
    overflow: "hidden",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
  },
  photo: { width: "100%", height: "100%" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  side: { gap: 8 },
  hint: { fontSize: 12, color: c.muted },
});
```

- [ ] **Step 5: Write the step components**

`mobile/src/design/PlanSteps.tsx`:
```tsx
import React, { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Globe, History, LocateFixed, Plus, Send, Sparkles, Trash2 } from "lucide-react-native";
import { Button, Copy, ErrorNote, Field, TextAction, s, useLargeText } from "./ui";
import { Chip, CoverCard, Tile } from "./kit";
import { CoverPicker, CoverRecovery } from "./CoverPicker";
import { PlanSchedule } from "./PlanSchedule";
import { categoryIcons } from "./categories";
import { colors as c, fonts, r } from "./tokens";
import { categoryKeys, categoryLabels, toggleCategory } from "../domain/categories";
import { DESCRIPTION_MAX, TITLE_MAX, eventPicture } from "../domain/events";
import { coverNotice, reviewLabels, type CoverCardPart } from "../domain/eventView";
import { parseLocalDateTime } from "../domain/plans";
import { joinLocal, quickDays, quickTimes, shortDay, splitLocal, spokenDate } from "../domain/schedule";
import type { Step } from "../domain/steps";
import type { PlanEditor } from "../state/usePlanEditor";

// UX-D2 step cards. Each step only renders; all logic lives in usePlanEditor.
export const STEP_TITLES: Record<Step, string> = {
  what: "What’s the plan?",
  when: "When?",
  where: "Where?",
  vibe: "What’s the vibe?",
  review: "Looks good?",
};
/** Required steps say so to VoiceOver (spec principle 7). */
export const STEP_HINTS: Record<Step, string | undefined> = {
  what: "Required",
  when: "Required",
  where: "Required. A name or address is enough.",
  vibe: "Required. Choose one or two.",
  review: undefined,
};

const pictureOf = (editor: PlanEditor) =>
  eventPicture({ activity_id: editor.sourceId, categories: editor.fields.categories });
const startIso = (start: string) => parseLocalDateTime(start)?.toISOString() ?? null;
const vibeChips = (editor: PlanEditor) =>
  editor.fields.categories.map((key) => ({ key, text: categoryLabels[key], category: key, icon: categoryIcons[key] }));

export function WhatStep({ editor }: { editor: PlanEditor }) {
  const { fields, setFields, locked, cover } = editor;
  return (
    <>
      <Field
        label="Name"
        placeholder="Dinner at Mario’s, a birthday walk…"
        value={fields.title}
        onChangeText={(title) => setFields({ ...fields, title })}
        maxLength={TITLE_MAX}
        editable={!locked}
        returnKeyType="next"
        accessibilityHint="Required"
        style={styles.bigInput}
      />
      <CoverPicker cover={cover} disabled={locked} fallback={pictureOf(editor)} />
    </>
  );
}

export function WhenStep({ editor }: { editor: PlanEditor }) {
  const { start, setStart, locked, zone } = editor;
  const largeText = useLargeText();
  const [pendingDay, setPendingDay] = useState<string | null>(null);
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [typing, setTyping] = useState(false);
  const now = new Date();
  const days = quickDays(now);
  const { day, time } = splitLocal(start);
  const chosenDay = day ?? pendingDay;
  const quickDay = days.find((d) => d.day === chosenDay);
  const chosenDate = chosenDay ? parseLocalDateTime(`${chosenDay} 12:00`) : null;
  const pickedOther = Boolean(chosenDate && !quickDay);
  const times = quickTimes(chosenDay, now);
  const otherTime = time !== null && !times.some((t) => t.time === time);
  const chooseDay = (next: string) => {
    setPendingDay(next);
    if (time) setStart(joinLocal(next, time));
  };
  const chooseTime = (next: string) => {
    if (chosenDay) setStart(joinLocal(chosenDay, next));
  };
  // Web QA types into "Date and time (local)"; iOS opens the native picker sheet.
  const pick = (mode: "date" | "time") => (Platform.OS === "web" ? setTyping(true) : setPicker(mode));
  return (
    <>
      <View style={styles.grid}>
        {days.map((d) => (
          <View key={d.key} style={[styles.cell, largeText && styles.full]}>
            <Tile title={d.text} label={d.label} selected={quickDay?.key === d.key} disabled={locked} onPress={() => chooseDay(d.day)} />
          </View>
        ))}
        <View style={[styles.cell, largeText && styles.full]}>
          <Tile
            title={pickedOther && chosenDate ? shortDay(chosenDate) : "Pick"}
            label={pickedOther && chosenDate ? `Pick a day, ${spokenDate(chosenDate, now)} selected` : "Pick a day"}
            selected={pickedOther}
            disabled={locked}
            onPress={() => pick("date")}
          />
        </View>
      </View>
      <View style={styles.chips}>
        {times.map((t) => (
          <Chip
            key={t.time}
            text={t.time}
            label={t.label}
            hint={chosenDay ? (t.disabled ? "Already past" : undefined) : "Choose a day first"}
            selected={time === t.time}
            disabled={locked || t.disabled}
            onPress={() => chooseTime(t.time)}
          />
        ))}
        <Chip
          text={otherTime && time ? time : "⋯"}
          label={otherTime && time ? `Other time, ${time}` : "Other time"}
          selected={otherTime}
          disabled={locked}
          onPress={() => pick("time")}
        />
      </View>
      <Chip
        icon={Globe}
        text={(zone.split("/").pop() ?? zone).replaceAll("_", " ")}
        label={`Times shown in ${zone.replaceAll("_", " ")}`}
      />
      {(Platform.OS !== "web" || typing) && (
        <PlanSchedule
          value={start}
          onChange={setStart}
          disabled={locked}
          buttons={false}
          picker={picker}
          onPickerClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

export function WhereStep({ editor, recent }: { editor: PlanEditor; recent: readonly string[] }) {
  const { place, changePlace, note, setNote, locked, locating, locate } = editor;
  const current = place.trim().toLocaleLowerCase();
  return (
    <>
      <Field
        label="Meeting place"
        placeholder="A café, a park, your place…"
        value={place}
        onChangeText={changePlace}
        maxLength={300}
        editable={!locked}
        returnKeyType="done"
        accessibilityHint="Required. A name or address is enough."
      />
      <View style={styles.chips}>
        <Chip
          icon={LocateFixed}
          text={locating ? "Finding you…" : "Current location"}
          label="Use my location"
          hint="Location is optional"
          disabled={locked || locating}
          onPress={() => void locate()}
        />
        {recent.map((p) => (
          <Chip
            key={p}
            icon={History}
            text={p}
            label={`Use recent place ${p}`}
            selected={current === p.toLocaleLowerCase()}
            disabled={locked}
            onPress={() => changePlace(p)}
          />
        ))}
      </View>
      <Field
        label="A note for everyone (optional)"
        placeholder="What to bring, where to find you…"
        value={note}
        onChangeText={setNote}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 110 }}
        maxLength={2000}
        editable={!locked}
      />
    </>
  );
}

export function VibeStep({ editor }: { editor: PlanEditor }) {
  const { fields, setFields, locked } = editor;
  const largeText = useLargeText();
  return (
    <View style={styles.grid}>
      {categoryKeys.map((key) => {
        const selected = fields.categories.includes(key);
        const full = !selected && fields.categories.length >= 2;
        return (
          <View key={key} style={[styles.cell, largeText && styles.full]}>
            <Tile
              role="checkbox"
              title={categoryLabels[key]}
              icon={categoryIcons[key]}
              category={key}
              selected={selected}
              disabled={locked || full}
              hint={full ? "Two categories are already chosen" : undefined}
              onPress={() => setFields({ ...fields, categories: toggleCategory(fields.categories, key) })}
            />
          </View>
        );
      })}
    </View>
  );
}

/** Review is exactly what guests will see (benchmark row 4); each part jumps to its step. */
export function ReviewStep({ editor, onJump }: { editor: PlanEditor; onJump: (part: CoverCardPart) => void }) {
  const { fields, setFields, place, note, start, locked, cover, sourceId, idea, historicalActivity } = editor;
  const [describing, setDescribing] = useState(Boolean(fields.description));
  const at = startIso(start);
  const sourceTitle = sourceId ? (idea?.title ?? historicalActivity?.title) : undefined;
  return (
    <>
      <CoverCard
        hero
        picture={pictureOf(editor)}
        uri={cover.uri}
        title={fields.title.trim() || "Your resbite"}
        startsAt={at}
        place={place}
        chips={vibeChips(editor)}
        onPressPart={onJump}
        partLabels={reviewLabels({ title: fields.title, startsAt: at, place, categories: fields.categories }, new Date())}
      />
      {sourceTitle ? <Chip icon={Sparkles} tone="aqua" text={sourceTitle} label={`From the idea ${sourceTitle}`} /> : null}
      {describing ? (
        <Field
          label="Description (optional)"
          placeholder="What you’ll do together"
          value={fields.description}
          onChangeText={(description) => setFields({ ...fields, description })}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 90 }}
          maxLength={DESCRIPTION_MAX}
          editable={!locked}
        />
      ) : (
        <Chip icon={Plus} text="Description" label="Add description" disabled={locked} onPress={() => setDescribing(true)} />
      )}
      {!!note && <Copy style={s.muted}>{note}</Copy>}
      {cover.pending && <CoverRecovery cover={cover} disabled={locked} />}
      {!!cover.message && (
        <Copy style={styles.hint} accessibilityLiveRegion="polite">
          {cover.message}
        </Copy>
      )}
      {editor.latest !== undefined && <LatestSaved editor={editor} />}
      {editor.pending && (
        <Copy style={s.muted}>
          The fields are held while the save is unconfirmed, so retrying sends exactly the same details.
        </Copy>
      )}
      {!editor.pending && !editor.busy && (
        <TextAction icon={Trash2} destructive title="Discard draft" onPress={editor.discardDraft} />
      )}
    </>
  );
}

function LatestSaved({ editor }: { editor: PlanEditor }) {
  const latest = editor.latest;
  return (
    <View style={styles.latest}>
      <Copy style={{ fontFamily: fonts.medium }}>Latest saved plan</Copy>
      {latest ? (
        <>
          <Copy>{latest.title}</Copy>
          <Copy>{new Date(latest.starts_at).toLocaleString()}</Copy>
          <Copy>{latest.place_label}</Copy>
          <Copy>{latest.note || "No note"}</Copy>
          {editor.latestEditable ? (
            <>
              <Copy style={s.muted}>Using these details replaces your unsaved draft.</Copy>
              <Button title="Use latest saved details" secondary onPress={() => editor.applyPlan(latest)} />
            </>
          ) : (
            <Copy>This plan is no longer editable.</Copy>
          )}
        </>
      ) : (
        <Copy>This plan is no longer available to your account.</Copy>
      )}
    </View>
  );
}

/** After a create (benchmark row 1): the picture, one large Invite tile, and the cover notice if the upload failed. */
export function InviteNext({ editor, onInvite }: { editor: PlanEditor; onInvite: () => void }) {
  return (
    <>
      <CoverCard
        hero
        heading={false}
        picture={pictureOf(editor)}
        uri={editor.cover.uri}
        title={editor.fields.title.trim()}
        startsAt={startIso(editor.start)}
        place={editor.place}
        chips={vibeChips(editor)}
      />
      <ErrorNote message={coverNotice(editor.created?.cover)} />
      <Tile size="large" icon={Send} title="Invite people" hint="Prepare a link for each person" onPress={onInvite} />
    </>
  );
}

/** Draft and save problems, in their current wording, on every step. */
export function DraftProblems({ editor }: { editor: PlanEditor }) {
  return (
    <>
      <ErrorNote message={editor.draftError} />
      {editor.draftError && <Button title={editor.draftRetryLabel} secondary onPress={editor.retryDraft} />}
      <ErrorNote message={editor.error} />
    </>
  );
}

const styles = StyleSheet.create({
  bigInput: { fontFamily: fonts.display, fontSize: 22, minHeight: 60 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cell: { width: "48%" },
  full: { width: "100%" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hint: { fontSize: 12, color: c.muted },
  latest: { gap: 10, padding: 18, borderRadius: r.tile, backgroundColor: c.pinkSoft },
});
```

- [ ] **Step 6: Render the steps in `arrange.tsx`**

Replace `mobile/app/arrange.tsx` with:
```tsx
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Back, Button, ErrorNote, Title, useReduceMotion, s } from "../src/design/ui";
import { colors as c } from "../src/design/tokens";
import { PreviewNotice } from "../src/design/Chrome";
import { StepScreen, announce, focusHeading } from "../src/design/kit";
import {
  DraftProblems,
  InviteNext,
  ReviewStep,
  STEP_HINTS,
  STEP_TITLES,
  VibeStep,
  WhatStep,
  WhenStep,
  WhereStep,
} from "../src/design/PlanSteps";
import { recentPlaces } from "../src/services/recentPlaces";
import { usePlanEditor } from "../src/state/usePlanEditor";
import type { CoverCardPart } from "../src/domain/eventView";
import {
  entryStep,
  firstMissingStep,
  nextStep,
  previousStep,
  stepNumber,
  stepProblem,
  type Step,
  type StepAnswers,
} from "../src/domain/steps";

const partSteps: Record<CoverCardPart, Step> = {
  picture: "what",
  title: "what",
  date: "when",
  place: "where",
  chips: "vibe",
};

export default function Arrange() {
  const { activity, plan: planId } = useLocalSearchParams<{ activity?: string; plan?: string }>();
  const editor = usePlanEditor({ activity, plan: planId });
  const reduceMotion = useReduceMotion();
  const scroll = useRef<ScrollView>(null);
  const heading = useRef<Text>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  // Set after a Review tap or a Review check: the pill reads "Done" and comes back to Review.
  const [returnTo, setReturnTo] = useState<"review" | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const answers: StepAnswers = { ...editor.fields, start: editor.start, place: editor.place };

  // VoiceOver focus follows the step (and the Invite screen).
  useEffect(() => {
    if (step === null) return;
    const frame = requestAnimationFrame(() => focusHeading(heading.current));
    return () => cancelAnimationFrame(frame);
  }, [step, editor.created]);
  useEffect(() => {
    if (!editor.error && !stepError) return;
    const frame = requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: !reduceMotion }));
    return () => cancelAnimationFrame(frame);
  }, [editor.error, editor.latest, stepError, reduceMotion]);
  useEffect(() => {
    if (!editor.scope) return;
    let active = true;
    recentPlaces.list(editor.scope).then(
      (items) => {
        if (active) setRecent(items);
      },
      () => {
        if (active) setRecent([]);
      },
    );
    return () => {
      active = false;
    };
  }, [editor.scope]);

  function go(next: Step, dir: "forward" | "back" = "forward") {
    setDirection(dir);
    setStepError(null);
    setStep(next);
  }
  function fail(at: Step, problem: string) {
    if (at !== step) go(at);
    setStepError(problem);
    announce(problem);
  }
  // Next stays enabled (benchmark row 2): a missing answer shows its message and is announced.
  function advance() {
    if (!step || step === "review") return;
    const problem = stepProblem(step, answers);
    if (problem) return fail(step, problem);
    if (returnTo === "review") {
      const missing = firstMissingStep(answers);
      if (missing && missing !== "review") return go(missing);
      setReturnTo(null);
      return go("review");
    }
    go(nextStep(step));
  }
  function back() {
    const previous = step && previousStep(step);
    if (previous) go(previous, "back");
  }
  function jump(part: CoverCardPart) {
    setReturnTo("review");
    go(partSteps[part]);
  }
  // Review re-checks everything and jumps to the first incomplete step. A pending save
  // is retried exactly as journaled, so it is not re-validated.
  function submit() {
    if (!editor.pending) {
      const missing = firstMissingStep(answers);
      if (missing) {
        setReturnTo("review");
        return fail(missing, stepProblem(missing, answers)!);
      }
    }
    setStepError(null);
    void editor.save();
  }
  const close = () => (router.canGoBack() ? router.back() : router.replace("/plans"));
  const later = () =>
    router.dismissTo({
      pathname: "/plans",
      params: { created: "1", updated: "0", cover: editor.created?.cover ?? "none" },
    });
  const invite = () => {
    if (editor.created) router.replace({ pathname: "/invitations", params: { plan: editor.created.planId } });
  };

  if (editor.ideaBlocked)
    return (
      <SafeAreaView style={s.page}>
        <ScrollView contentContainerStyle={s.body}>
          <Back />
          <Title>{editor.catalogue.loading ? "Checking your activity…" : "Activity unavailable"}</Title>
          {editor.catalogue.loading ? (
            <ActivityIndicator accessibilityLabel="Checking activity" color={c.aquaDark} />
          ) : (
            <>
              <ErrorNote
                message={
                  editor.catalogue.error ??
                  "This activity is not available to plan right now. Any saved draft stays on this device."
                }
              />
              <Button title="Check activity again" onPress={editor.catalogue.refresh} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  if (!editor.ready)
    return (
      <SafeAreaView style={s.page}>
        <View style={s.body}>
          <Back />
          <Title>{editor.preparing ? "Getting your plan…" : "Let’s take another look."}</Title>
          {editor.preparing ? (
            <ActivityIndicator accessibilityLabel="Loading plan" color={c.aquaDark} />
          ) : (
            <>
              <ErrorNote message={editor.error ?? "We couldn’t open this plan. Try again."} />
              <Button title="Try loading again" onPress={editor.retryLoad} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  if (editor.created)
    return (
      <StepScreen
        step={null}
        title="It’s on!"
        titleRef={heading}
        scrollRef={scroll}
        onClose={later}
        header={<PreviewNotice dismissible={false} />}
        primary={<Button title="Later" secondary icon={false} onPress={later} />}
      >
        <InviteNext editor={editor} onInvite={invite} />
      </StepScreen>
    );
  // The entry step is decided once, when the editor is ready (UX-D3). It is never stored in the draft.
  if (step === null) {
    setStep(
      entryStep({ mode: editor.mode, restored: editor.restored, pending: editor.pending !== null, answers }),
    );
    return null;
  }
  const saveTitle = editor.pending
    ? "Retry save"
    : editor.mode === "edit"
      ? editor.preview
        ? "Save preview"
        : "Save"
      : editor.preview
        ? "Create preview"
        : "Create";
  const primary =
    step === "review" ? (
      <Button
        title={saveTitle}
        onPress={submit}
        loading={editor.busy}
        disabled={
          editor.locating ||
          editor.cover.busy ||
          editor.latest !== undefined ||
          (editor.mode === "edit" && !editor.dirty && !editor.pending)
        }
      />
    ) : (
      <Button title={returnTo === "review" ? "Done" : "Next"} onPress={advance} />
    );
  return (
    <StepScreen
      step={stepNumber(step)}
      title={STEP_TITLES[step]}
      hint={STEP_HINTS[step]}
      titleRef={heading}
      scrollRef={scroll}
      direction={direction}
      onBack={previousStep(step) ? back : undefined}
      onClose={close}
      header={<PreviewNotice dismissible={false} />}
      status={editor.draftStatus}
      primary={primary}
    >
      {step === "what" && <WhatStep editor={editor} />}
      {step === "when" && <WhenStep editor={editor} />}
      {step === "where" && <WhereStep editor={editor} recent={recent} />}
      {step === "vibe" && <VibeStep editor={editor} />}
      {step === "review" && <ReviewStep editor={editor} onJump={jump} />}
      <ErrorNote message={stepError} />
      <DraftProblems editor={editor} />
    </StepScreen>
  );
}
```

Delete `mobile/src/design/EventDetailsFields.tsx`. In `mobile/src/design/categories.tsx`, delete the `CategoryChoices` function and its `choices` and `choice` styles, and remove `categoryKeys` and `toggleCategory` from the `../domain/categories` import (`categoryLabels` stays).

- [ ] **Step 7: Move the existing browser scripts to the step flow**

`mobile/scripts/verify-planning.mjs`:
1. After the `@playwright/test` import, add:
```js
import {
  button,
  cancelFromList,
  close,
  editEvent,
  expectCancelled,
  expectCategories,
  heading,
  inviteFromList,
  later,
  next,
  typeDate,
} from "./qa-helpers.mjs";
```
2. In the first preview test, replace everything from the click on the "Coffee together" button up to, but not including, `await page.getByRole("tab", { name: "Wellness", exact: true }).click();` (this includes Task 2's recent-places lines) with:
```js
  await page.getByRole("button", { name: "Coffee together", exact: true }).click();
  await page.getByRole("button", { name: "Use this idea", exact: true }).click();
  // An idea opens at Review (UX-D3). Create jumps to the first missing answer and says why.
  await expect(heading(page, "Looks good?")).toBeVisible();
  await button(page, "Create preview").click();
  await expect(page.getByText("Add a meeting place.", { exact: true })).toBeInViewport();
  await expect(heading(page, "Where?")).toBeFocused();
  await page.getByLabel("Meeting place", { exact: true }).fill("The garden café");
  await page.getByLabel("A note for everyone (optional)", { exact: true }).fill("Meet by the window.");
  await button(page, "Previous step").click();
  await typeDate(page, "2099-02-30 12:00");
  await next(page);
  await expect(page.getByText("Choose a date and time in the future.", { exact: true })).toBeInViewport();
  await page.getByLabel("Date and time (local)", { exact: true }).fill("2099-03-01 12:00");
  await expect(page.getByText("Draft saved on this device.", { exact: true })).toBeVisible();
  await page.goto(baseURL);
  await page.getByText("Preview the design", { exact: true }).click();
  await page.getByRole("tab", { name: "My resbites", exact: true }).click();
  await button(page, /^Continue draft/).click();
  // A complete restored draft opens at Review.
  await expect(button(page, "Edit place, The garden café")).toBeVisible();
  await expect(page.getByText("Meet by the window.", { exact: true })).toBeVisible();
  await button(page, "Create preview").click();
  await later(page);
  await expect(page.getByText("The garden café", { exact: true })).toBeVisible();
  // Recent places (UX-P6): a successful save remembers its place on this device.
  const recent = () => page.evaluate(() => sessionStorage.getItem("resbite.recent-places.v1.preview"));
  await expect.poll(recent).toBe(JSON.stringify(["The garden café"]));
  await editEvent(page, "Coffee together");
  await expect(button(page, "Save preview")).toBeDisabled();
  await button(page, "Edit place, The garden café").click();
  await page.getByLabel("Meeting place", { exact: true }).fill("The riverside café");
  page.once("dialog", (dialog) => dialog.dismiss());
  await close(page);
  await expect(page.getByLabel("Meeting place", { exact: true })).toHaveValue("The riverside café");
  await next(page);
  await button(page, "Save preview").click();
  await expect(page.getByText("The riverside café", { exact: true })).toBeVisible();
  await expect(page.getByText("The garden café", { exact: true })).toHaveCount(0);
  await expect.poll(recent).toBe(JSON.stringify(["The riverside café", "The garden café"]));
  await inviteFromList(page, "Coffee together", "Invitations are disabled in design preview.");
  await cancelFromList(page, "Coffee together");
  await expectCancelled(page, "Coffee together");
```
3. In the legacy block, change the "Continue draft" click to `await button(legacy, /^Continue draft/).click();` and the "Save changes" click to `await button(legacy, "Save preview").click();`. Leave its card assertion for Task 7.
4. In the blank block, replace everything from the "New resbite" click through the `planCard` assertion with:
```js
  await blank.getByRole("button", { name: "New resbite", exact: true }).click();
  await next(blank);
  await expect(blank.getByText("Give your resbite a name.", { exact: true })).toBeVisible();
  await blank.getByLabel("Name", { exact: true }).fill("Garden picnic");
  await next(blank);
  await next(blank);
  await blank.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
  await next(blank);
  await next(blank);
  await expect(blank.getByText("Choose one or two categories.", { exact: true })).toBeVisible();
  await blank.getByRole("checkbox", { name: "Natural", exact: true }).click();
  await blank.getByRole("checkbox", { name: "Community", exact: true }).click();
  await expect(blank.getByRole("checkbox", { name: "Creative", exact: true })).toBeDisabled();
  await next(blank);
  await button(blank, "Create preview").click();
  await later(blank);
  await expect(blank.getByText("Garden picnic", { exact: true })).toBeVisible();
  await expectCategories(blank, "Garden picnic", "Natural · Community");
```
5. In the untouched-editor block:
   - change every `getByRole("button", { name: "Continue draft", exact: true })` to `getByRole("button", { name: /^Continue draft/ })`;
   - replace `const back = (page) => page.getByRole("button", { name: "Back", exact: true }).click();` with `const back = (page) => close(page);`;
   - replace the whole `kept` case (from `const kept = await open();` to `await kept.context().close();`) with:
```js
    const kept = await open();
    await kept.getByLabel("Name", { exact: true }).fill("Garden picnic");
    await expect(kept.getByText("Draft saved on this device.", { exact: true })).toBeVisible();
    kept.once("dialog", (dialog) => dialog.accept());
    await back(kept);
    await expect(kept.getByRole("button", { name: /^Continue draft/ })).toBeVisible();
    await kept.getByRole("button", { name: /^Continue draft/ }).click();
    // A restored incomplete draft opens at its first missing step (Where); go back to What.
    await expect(heading(kept, "Where?")).toBeVisible();
    await button(kept, "Previous step").click();
    await button(kept, "Previous step").click();
    await expect(kept.getByLabel("Name", { exact: true })).toHaveValue("Garden picnic");
    await kept.waitForTimeout(1200);
    // The resumed draft still differs from its baseline, so it is kept when left unchanged.
    kept.once("dialog", (dialog) => dialog.accept());
    await back(kept);
    await expect(kept.getByRole("button", { name: /^Continue draft/ })).toBeVisible();
    await kept.getByRole("button", { name: /^Continue draft/ }).click();
    await button(kept, "Previous step").click();
    await button(kept, "Previous step").click();
    // Returning a restored draft to its baseline removes it.
    await kept.getByLabel("Name", { exact: true }).fill("");
    await kept.waitForTimeout(1200);
    await back(kept);
    await noDraft(kept);
    await kept.context().close();
```
6. In the signed-in scenarios, replace everything from `await fixture.goto(\`${baseURL}/arrange?plan=${savedPlan.id}\`);` to just before `console.log(\`PASS: mocked ${scenario} save, retained draft and safe retry.\`);` with:
```js
    await fixture.goto(`${baseURL}/arrange?plan=${savedPlan.id}`);
    // An edit opens at Review (UX-D3); the place part jumps to Where.
    await button(fixture, "Edit place, Original café").click();
    await fixture.getByLabel("Meeting place", { exact: true }).fill("My unsaved café");
    await next(fixture);
    await button(fixture, "Save").click();
    await expect(button(fixture, "Edit place, My unsaved café")).toBeVisible();
    if (scenario === "storage_failure") {
      await expect(
        fixture.getByText("Couldn’t protect this save on your device. Nothing was sent; try again.", { exact: true }),
      ).toBeVisible();
      assert.equal(writes.length, 0);
      await expect(button(fixture, "Edit place, My unsaved café")).toBeVisible();
      await fixture.context().close();
      console.log("PASS: failed local save journal prevents network mutation and retains fields.");
      continue;
    }
    if (scenario === "offline" || scenario === "lost_reply") {
      await expect(button(fixture, "Retry save")).toBeVisible();
      const lockedPlace = async () => {
        await button(fixture, "Edit place, My unsaved café").click();
        await expect(fixture.getByLabel("Meeting place", { exact: true })).toHaveValue("My unsaved café");
        await expect(fixture.getByLabel("Meeting place", { exact: true })).not.toBeEditable();
        await next(fixture);
      };
      await lockedPlace();
      await fixture.reload();
      // A restored unconfirmed save opens at Review with Retry save.
      await expect(button(fixture, "Retry save")).toBeVisible();
      await lockedPlace();
      await button(fixture, "Retry save").click();
      await expect(fixture.getByText("My unsaved café", { exact: true })).toBeVisible();
      if (scenario === "lost_reply")
        assert.equal(writes.length, 1, "Committed edit must not be sent again after restart");
      else assert.deepEqual(writes[0], writes[1]);
      assert.equal(
        await fixture.evaluate(() => sessionStorage.getItem("resbite.drafts.v1.11111111-1111-4111-8111-111111111111")),
        null,
      );
    } else {
      await expect(fixture.getByText("Changed elsewhere", { exact: true })).toBeVisible();
      await expect(button(fixture, "Save")).toBeDisabled();
      assert.equal(writes.length, 1);
      await button(fixture, "Use latest saved details").click();
      await button(fixture, "Edit place, Changed elsewhere").click();
      await fixture.getByLabel("Meeting place", { exact: true }).fill("Reviewed café");
      await next(fixture);
      await button(fixture, "Save").click();
      await expect(fixture.getByText("Reviewed café", { exact: true })).toBeVisible();
      assert.equal(writes[1].p_version, 2);
    }
```

`mobile/scripts/verify-covers.mjs`:
1. After the `@playwright/test` import, add `import { button, closeToList, editEvent, later, next } from "./qa-helpers.mjs";`.
2. In the preview part, replace everything from the "New resbite" click through the "Save preview plan" click with:
```js
  await preview.getByRole("button", { name: "New resbite", exact: true }).click();
  await preview.getByLabel("Name", { exact: true }).fill("Cover picnic");
  const previewChooser = preview.waitForEvent("filechooser");
  await preview.getByRole("button", { name: "Add cover photo", exact: true }).click();
  await (await previewChooser).setFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: await syntheticPng(preview, 3000, 1000),
  });
  await expect(preview.getByText("Preview cover stays in memory. Nothing is uploaded.", { exact: true })).toBeVisible();
  await next(preview);
  await next(preview);
  await preview.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
  await next(preview);
  await preview.getByRole("checkbox", { name: "Natural", exact: true }).click();
  await next(preview);
  await button(preview, "Create preview").click();
  await later(preview);
```
3. In the signed-in part, replace everything from the "New resbite" click through the first `await page.getByRole("button", { name: "Retry cover", exact: true }).click();` with:
```js
  await page.getByRole("button", { name: "New resbite", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Garden picnic");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add cover photo", exact: true }).click();
  await (await chooser).setFiles({ name: "wide.png", mimeType: "image/png", buffer: await syntheticPng(page, 4000, 1200) });
  await expect(page.getByText("Your cover uploads after the resbite is saved.", { exact: true })).toBeVisible();
  await next(page);
  await next(page);
  await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
  await next(page);
  await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
  await next(page);
  await button(page, "Create").click();
  const coverPending = "Your resbite is saved, but its cover photo hasn’t uploaded yet. Open Edit plan to retry.";
  // The Invite screen shows the cover notice; Later carries it to My resbites.
  await expect(page.getByText(coverPending, { exact: true })).toBeVisible();
  await later(page);
  await expect(page.getByText(coverPending, { exact: true })).toBeVisible();
  assert.equal(plans.size, 1);
  const [plan] = plans.values();
  assert.equal(uploads.length, 1);
  assert.match(uploads[0], new RegExp(`^${user.id}/${plan.id}/[0-9a-f-]+\\.jpg$`));
  assert.equal(plan.cover_path, null);
  // Edit opens at Review, which offers the pending-cover recovery.
  await editEvent(page, "Garden picnic");
  await button(page, "Retry cover").click();
```
4. Directly before the `"Remove cover photo"` click, add `await button(page, "Edit photo").click();`. The photo controls are on the What step.
5. Replace `await page.getByRole("button", { name: "My resbites", exact: true }).click();` with `await closeToList(page);`.
6. In part 3, replace `await page.getByRole("button", { name: "Edit plan", exact: true }).click();` with:
```js
  await editEvent(page, "Garden picnic");
  await button(page, "Edit photo").click();
```

`mobile/scripts/verify-catalogue.mjs`:
1. After the `@playwright/test` import, add `import { button, closeToList, createFromIdea, editEvent, heading, later } from "./qa-helpers.mjs";`.
2. In the 320/390 loop, replace the two assertions after the first "Use this idea" click (`Meeting place` visible, and the heading "Published coffee") with:
```js
    // An idea opens at Review (UX-D3), showing the idea's own text.
    await expect(heading(f.page, "Looks good?")).toBeVisible();
    await expect(button(f.page, "Edit name, Published coffee")).toBeVisible();
```
   Then change the `{ name: "Save plan", exact: true }` count check to `{ name: "Create", exact: true }`.
3. In the preview loop, replace the "Meeting place" fill and the "Save preview plan" click with:
```js
    await createFromIdea(preview.page, `Fixture place for ${item.title}`);
    await later(preview.page);
```
   Then replace everything from the "Edit plan" `.first()` click through the "My resbites" click with:
```js
    await editEvent(preview.page, item.title);
    await expect(button(preview.page, `Edit name, ${item.title}`)).toBeVisible();
    await expect(button(preview.page, `Edit place, Fixture place for ${item.title}`)).toBeVisible();
    await closeToList(preview.page);
```

`mobile/scripts/verify-people.mjs`:
1. After the `@playwright/test` import, add `import { choosePeople, createFromIdea, later } from "./qa-helpers.mjs";`.
2. Replace the "Meeting place" fill ("Test café"), the "Save preview plan" click and the first "Choose people" click with:
```js
  await createFromIdea(page, "Test café");
  await later(page);
  await choosePeople(page, "Coffee together");
```
3. Replace the second "Choose people" click (after returning to My resbites) with `await choosePeople(page, "Coffee together");`.

- [ ] **Step 8: Run the checks**

Run: `cd mobile && npm run check`
Expected: a clean typecheck, with 192 tests passing.

Restart Expo web with `--clear`, then run:
```bash
for s in verify-steps verify-planning verify-covers verify-catalogue verify-people verify-kit; do echo "== $s"; node scripts/$s.mjs || echo "FAILED: $s"; done
```
Expected: every PASS line and no `FAILED:` line. Look through `/private/tmp/resbite-steps/*-large-320.png` for clipped text.

- [ ] **Step 9: Commit**

```bash
git add mobile/app/arrange.tsx mobile/src/design/PlanSteps.tsx mobile/src/design/CoverPicker.tsx mobile/src/design/PlanSchedule.tsx mobile/src/design/categories.tsx mobile/src/state/usePlanEditor.ts mobile/scripts/qa-helpers.mjs mobile/scripts/verify-steps.mjs mobile/scripts/verify-planning.mjs mobile/scripts/verify-covers.mjs mobile/scripts/verify-catalogue.mjs mobile/scripts/verify-people.mjs
git rm mobile/src/design/EventDetailsFields.tsx
git commit -m "Create resbites in four step cards with a Review card and an Invite screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: One event page for both roles; claim lands on the answer

**Files:**
- Create: `mobile/app/event.tsx`, `mobile/src/state/useEvent.ts`, `mobile/scripts/verify-event.mjs`
- Replace: `mobile/app/invite.tsx`
- Modify: `mobile/src/services/rsvp.ts` (`readEvent`), `mobile/app/_layout.tsx` (register `event`), `mobile/src/state/usePlanEditor.ts` (a `new` draft keeps its idea), `mobile/app/(tabs)/plans.tsx` (two routes), `mobile/scripts/verify-rsvp.mjs`

**Interfaces:**
- Consumes:
  - Task 1: `answerKey`, `cantMakeItResponse`, `cardChips`, `mapsUrl`, `responseText`, `againDraft`, `againConflict` and `draftRoute`;
  - Task 3: `CoverCard`, `Chip`, `chipToneFor`, `IconButton`, `InfoSheet`, `Segmented`, `Tile` and `AvatarStack`;
  - the existing `canRespond`, `canReadSample` and `reconcileRsvp` (`domain/rsvp.ts`), `readRsvp`, `writeRsvp` and `claimInvitation` (`services/rsvp.ts`), `cancelPlan` and `PlanSaveError` (`domain/plans.ts`), `planGateway` and `drafts`.
- Produces:
  - `type Guest = { userId: string; name: string; response: string }` and `type EventSnapshot = { plan: Plan; attendee: { version: number; response: string } | null; guests: Guest[] }`, with `readEvent(planId: string, userId: string): Promise<EventSnapshot>`;
  - `useEvent(planId: string | undefined): EventPage`, where `EventPage` is `{ plan, role: "owner" | "invitee" | null, attendee, guests, busy, fresh, error, notice, pending, load, respond, cancel, setNotice }`;
  - route `/event?plan=<id>`; `/invite` now only claims, then replaces itself with `/event?plan=<id>`.
- Labels (exact):
  - "Back";
  - "Open {place} in Maps" (chip "Open in Maps");
  - "{n} going" (sheet "Guests"; rows show `responseText`);
  - organizer:
    - "Edit {title}", "Invite someone", "Choose people" and "More actions";
    - the More sheet: "Do this again" and "Cancel event", with "Cancel this plan for everyone?", "Yes, cancel plan" and "Keep plan";
  - invitee:
    - the radio group "Your answer" with "Going" and "Can’t make it";
    - "Retry my response" and "Refresh invitation";
    - "View sample conversation" (chip "Sample chat").
- New copy:
  - "Replace the unfinished resbite draft on this device?" (Replace / Keep draft);
  - "Finish the new resbite that’s waiting on this device first. Open it from My resbites.";
  - "Couldn’t start a copy on this device. Try again.";
  - "Opening your resbite…" and "This resbite isn’t available.".

- [ ] **Step 1: Write the failing browser check**

`mobile/scripts/verify-event.mjs`:
```js
// UX1 event page for both roles. Every Supabase request is intercepted; nothing is sent.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { visible } from "./qa-helpers.mjs";
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const browser = await chromium.launch({
  channel: process.env.RESBITE_QA_BROWSER || "chrome",
  headless: true,
});
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: { registration_details_version: 1 },
  created_at: "2026-01-01T00:00:00Z",
};
const expiry = Math.floor(Date.now() / 1000) + 3600;
const token = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, role: "authenticated" })).toString("base64url"),
  "local-fixture-only",
].join(".");
const session = {
  access_token: token,
  refresh_token: "local-fixture",
  token_type: "bearer",
  expires_at: expiry,
  expires_in: 3600,
  user,
};
const hosted = {
  id: "22222222-2222-4222-8222-222222222222",
  activity_id: "coffee-together",
  title: "Coffee evening",
  description: "Bring a book",
  categories: ["community", "uplifting"],
  owner_id: user.id,
  starts_at: "2099-03-01T15:00:00Z",
  time_zone: "UTC",
  place_label: "Fixture café",
  note: "Window table",
  status: "active",
  version: 1,
  cover_path: null,
  cover_revision: 0,
};
const invited = {
  ...hosted,
  id: "44444444-4444-4444-8444-444444444444",
  title: "Board games",
  owner_id: "33333333-3333-4333-8333-333333333333",
  place_label: "Games room",
  note: "",
};
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((s) => {
    sessionStorage.setItem("sb-ewcsgvhuojxdpaspwsrx-auth-token", JSON.stringify(s));
    window.open = (url) => {
      window.__opened = String(url);
      return null;
    };
  }, session);
  const plans = new Map([
    [hosted.id, { ...hosted }],
    [invited.id, { ...invited }],
  ]);
  let attendee = { version: 1, response: "pending" };
  const responses = [];
  const cancels = [];
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const one = req.headers().accept?.includes("object");
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/v1/user") return reply(user);
    if (path === "/rest/v1/rpc/account_access_status") return reply({ account_id: user.id, status: "approved" });
    if (path === "/rest/v1/profiles")
      return reply({ id: user.id, display_name: "Fixture", avatar_path: null, avatar_revision: 0 });
    if (path === "/rest/v1/activities") return reply([]);
    if (path === "/rest/v1/plans") {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      const rows = [...plans.values()].filter((p) => !id || p.id === id);
      return reply(one ? (rows[0] ?? null) : rows);
    }
    if (path === "/rest/v1/attendees") {
      if (one) return reply(attendee);
      const planId = url.searchParams.get("plan_id")?.replace(/^eq\./, "");
      return reply(
        planId === hosted.id
          ? [
              { user_id: "g1", response: "accepted", profiles: { display_name: "Alex" } },
              { user_id: "g2", response: "pending", profiles: { display_name: "Bea" } },
            ]
          : [{ user_id: user.id, response: attendee.response, profiles: { display_name: "Fixture" } }],
      );
    }
    if (path === "/rest/v1/rpc/respond") {
      const body = req.postDataJSON();
      responses.push(body.p_response);
      assert.equal(body.p_version, attendee.version);
      attendee = { version: attendee.version + 1, response: body.p_response };
      return reply(attendee.version);
    }
    if (path === "/rest/v1/rpc/change_plan_v2") {
      const body = req.postDataJSON();
      assert.equal(body.p_cancel, true);
      cancels.push(body.p_plan);
      const plan = plans.get(body.p_plan);
      plan.status = "cancelled";
      plan.version++;
      return reply(plan.version);
    }
    return reply({ message: `Unexpected ${req.method()} ${path}` }, 400);
  });

  // Organizer.
  await page.goto(`${base}/event?plan=${hosted.id}`);
  await expect(page.getByRole("heading", { name: "Coffee evening", exact: true })).toBeVisible();
  await expect(page.getByText("Hosting", { exact: true })).toBeVisible();
  await expect(page.getByText("Bring a book", { exact: true })).toBeVisible();
  // Guests: an avatar stack and its list sheet (the visibility rule is unchanged in UX1).
  await page.getByRole("button", { name: "1 going", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Guests", exact: true })).toBeVisible();
  await expect(page.getByText("Bea", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  // Open in Maps opens only when tapped, here with the place name.
  assert.equal(await page.evaluate(() => window.__opened ?? null), null);
  await page.getByRole("button", { name: "Open Fixture café in Maps", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__opened), "https://maps.apple.com/?q=Fixture%20caf%C3%A9");
  // Edit opens creation at Review.
  await page.getByRole("button", { name: "Edit Coffee evening", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Looks good?", exact: true })).toBeVisible();
  await expect(visible(page.getByRole("button", { name: "Save", exact: true }))).toBeDisabled();
  await visible(page.getByRole("button", { name: "Close", exact: true })).click();
  await expect(page.getByRole("heading", { name: "Coffee evening", exact: true })).toBeVisible();
  // Do this again: a new draft with the text, place, note and idea, never the date; it opens at When.
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("button", { name: "Do this again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "When?", exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Step 2 of 4", exact: true })).toBeVisible();
  const draft = JSON.parse(
    await page.evaluate((key) => sessionStorage.getItem(key), `resbite.drafts.v1.${user.id}`),
  ).find((d) => d.key === "new");
  assert.deepEqual(
    [draft.title, draft.description, draft.categories, draft.place, draft.note, draft.start, draft.activityId, draft.pending],
    ["Coffee evening", "Bring a book", ["community", "uplifting"], "Fixture café", "Window table", "", "coffee-together", null],
  );
  await visible(page.getByRole("button", { name: "Previous step", exact: true })).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Coffee evening");
  page.once("dialog", (dialog) => dialog.accept());
  await visible(page.getByRole("button", { name: "Close", exact: true })).click();
  // Doing it again over an unfinished new draft asks first; dismissing keeps the draft.
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  let asked = "";
  page.once("dialog", (dialog) => {
    asked = dialog.message();
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Do this again", exact: true }).click();
  await expect.poll(() => asked).toBe("Replace the unfinished resbite draft on this device?");
  await page.getByRole("button", { name: "Close sheet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Coffee evening", exact: true })).toBeVisible();
  // Cancel keeps its confirmation and semantics.
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await expect(page.getByText("Cancel this plan for everyone?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yes, cancel plan", exact: true }).click();
  await expect(page.getByText("Your plan is cancelled.", { exact: true })).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Coffee evening", exact: true })).toHaveCount(0);
  assert.deepEqual(cancels, [hosted.id]);
  console.log("PASS: organizer event page: guests, Open in Maps, Edit at Review, Do this again at When with a replace guard, cancel.");

  // Invitee.
  await page.goto(`${base}/event?plan=${invited.id}`);
  await expect(page.getByRole("heading", { name: "Board games", exact: true })).toBeVisible();
  await expect(page.getByText("Invited", { exact: true })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Your answer", exact: true })).toBeVisible();
  const going = page.getByRole("radio", { name: "Going", exact: true });
  const cant = page.getByRole("radio", { name: "Can’t make it", exact: true });
  await expect(going).not.toBeChecked();
  await expect(cant).not.toBeChecked();
  await cant.click();
  await expect(page.getByText("Your response is saved.", { exact: true })).toBeVisible();
  await expect(cant).toBeChecked();
  await going.click();
  await expect(going).toBeChecked();
  await expect(page.getByRole("button", { name: "View sample conversation", exact: true })).toBeVisible();
  await cant.click();
  await expect(cant).toBeChecked();
  assert.deepEqual(responses, ["declined", "accepted", "withdrawn"]);
  await expect(page.getByRole("button", { name: "Refresh invitation", exact: true })).toBeVisible();
  await context.close();
  assert.deepEqual(errors, []);
  console.log("PASS: invitee answer control: Can’t make it declines before Going and withdraws after it.");
} finally {
  await browser.close();
}
```

Start Expo web (`--clear`) and run: `cd mobile && node scripts/verify-event.mjs`
Expected: FAIL, because `/event` is unmatched and the heading "Coffee evening" never appears.

- [ ] **Step 2: Read the whole event for either role**

Append to `mobile/src/services/rsvp.ts`, and add `import type { Plan } from "../domain/plans";` at the top:
```ts
export type Guest = { userId: string; name: string; response: string };
export type EventSnapshot = {
  plan: Plan;
  /** The signed-in invitee's own row; null for the organizer. */
  attendee: { version: number; response: string } | null;
  guests: Guest[];
};
const eventUnavailable =
  "This invitation is unavailable, or its details could not be refreshed. Check your connection and try again.";

/** The event page's read (UX1). The guest list follows the existing read rule, unchanged until UX2. */
export async function readEvent(planId: string, userId: string): Promise<EventSnapshot> {
  const [plan, guests] = await Promise.all([
    withDeadline((signal) => supabase.from("plans").select("*").eq("id", planId).abortSignal(signal).single()),
    withDeadline((signal) =>
      supabase
        .from("attendees")
        .select("user_id,response,profiles(display_name)")
        .eq("plan_id", planId)
        .abortSignal(signal),
    ),
  ]);
  if (plan.error || !plan.data) throw new Error(eventUnavailable);
  let attendee: EventSnapshot["attendee"] = null;
  if (plan.data.owner_id !== userId) {
    const own = await withDeadline((signal) =>
      supabase
        .from("attendees")
        .select("version,response")
        .eq("plan_id", planId)
        .eq("user_id", userId)
        .abortSignal(signal)
        .single(),
    );
    if (own.error) throw new Error(eventUnavailable);
    attendee = own.data;
  }
  const rows: unknown = guests.error ? [] : guests.data;
  return {
    plan: plan.data as Plan,
    attendee,
    guests: Array.isArray(rows)
      ? rows.map((row: { user_id: string; response: string; profiles: { display_name: string } | null }) => ({
          userId: row.user_id,
          name: row.profiles?.display_name || "Tester",
          response: row.response,
        }))
      : [],
  };
}
```

`mobile/src/state/useEvent.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useApp, type LocalPlan } from "./AppState";
import { useAccount } from "./AccountState";
import { cancelPlan, PlanSaveError } from "../domain/plans";
import { reconcileRsvp, type Response, type RsvpAttempt } from "../domain/rsvp";
import { planGateway } from "../services/plans";
import { readEvent, readRsvp, writeRsvp, type EventSnapshot, type Guest } from "../services/rsvp";

export type EventRole = "owner" | "invitee";
export type EventPage = {
  plan: LocalPlan | null;
  role: EventRole | null;
  attendee: EventSnapshot["attendee"];
  guests: Guest[];
  busy: boolean;
  fresh: boolean;
  error: string | null;
  notice: string | null;
  pending: RsvpAttempt | null;
  load: () => Promise<void>;
  respond: (value: Response, retry?: RsvpAttempt) => Promise<void>;
  cancel: () => Promise<void>;
  setNotice: (notice: string | null) => void;
};

/**
 * One event for both roles (UX1). load and respond are invite.tsx's logic, unchanged
 * apart from reading the whole event; cancel is My resbites' (cancelPlan), unchanged.
 */
export function useEvent(planId: string | undefined): EventPage {
  const { session, preview, localPlans, setLocalPlans, captureSession, signingOut } = useApp();
  const account = useAccount();
  const accountReady = account.status === "approved" && account.reviewed && account.profileReady;
  const userId = session?.user.id;
  const identity = `${userId}:${planId}:${preview}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const focused = useRef(false),
    generation = useRef(0),
    working = useRef(false);
  const [snapshot, setSnapshot] = useState<EventSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(!preview),
    [fresh, setFresh] = useState(false);
  const [pending, setPending] = useState<RsvpAttempt | null>(null);
  useEffect(() => {
    setSnapshot(null);
    setPending(null);
    setNotice(null);
    setError(null);
    setFresh(false);
    working.current = false;
  }, [identity]);
  const load = useCallback(async () => {
    if (!userId || !planId || preview || signingOut || working.current || !accountReady) return;
    const assertSession = captureSession();
    const run = ++generation.current;
    const valid = () => {
      try {
        assertSession();
      } catch {
        return false;
      }
      return focused.current && currentIdentity.current === identity && generation.current === run;
    };
    setBusy(true);
    setFresh(false);
    setError(null);
    try {
      const next = await readEvent(planId, userId);
      if (valid()) {
        setSnapshot(next);
        setFresh(true);
      }
    } catch (e) {
      if (valid()) {
        setSnapshot(null);
        setError(e instanceof Error ? e.message : "Invitation unavailable.");
      }
    } finally {
      if (valid()) setBusy(false);
    }
  }, [identity, planId, userId, preview, signingOut, captureSession, accountReady]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void load();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void load();
        else {
          setFresh(false);
          ++generation.current;
        }
      });
      return () => {
        focused.current = false;
        ++generation.current;
        sub.remove();
      };
    }, [load]),
  );
  async function respond(value: Response, retry?: RsvpAttempt) {
    const current = snapshot;
    const attendee = current?.attendee;
    if (!current || !attendee || !userId || preview || !accountReady || working.current || !focused.current) return;
    working.current = true;
    const assertSession = captureSession();
    const operation = ++generation.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    setFresh(false);
    const valid = () => {
      try {
        assertSession();
      } catch {
        return false;
      }
      return focused.current && currentIdentity.current === identity && generation.current === operation;
    };
    const attempt = retry ?? {
      planId: current.plan.id,
      planVersion: current.plan.version,
      version: attendee.version,
      response: value,
    };
    setPending(attempt);
    try {
      let next = await readRsvp(attempt.planId, userId);
      if (!valid()) return;
      const decision = reconcileRsvp(attempt, next);
      if (decision === "retry") {
        try {
          assertSession();
          await writeRsvp(attempt);
        } catch {
          /* Confirm saved state before offering an identical retry. */
        }
        if (!valid()) return;
        next = await readRsvp(attempt.planId, userId);
        if (!valid()) return;
      }
      const confirmed = next;
      setSnapshot((old) => ({
        plan: confirmed.plan,
        attendee: confirmed.attendee,
        guests: (old?.guests ?? []).map((g) =>
          g.userId === userId ? { ...g, response: confirmed.attendee.response } : g,
        ),
      }));
      setFresh(true);
      const result = reconcileRsvp(attempt, confirmed);
      if (result === "confirmed") {
        setPending(null);
        setNotice("Your response is saved.");
      } else if (result === "review" || result === "unavailable") {
        setPending(null);
        setError(
          result === "review"
            ? "The plan or your response changed. Review the latest details before choosing again."
            : "This plan is cancelled or has already started. Responses are closed.",
        );
      } else
        setError(
          "Your response is not confirmed. Retry checks the saved response before trying the same choice again.",
        );
    } catch {
      if (valid()) setError("We could not confirm your response. Check your connection, then retry.");
    } finally {
      if (currentIdentity.current === identity) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  async function cancel() {
    const target = plan;
    if (!target || working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    let failure: string | null = null;
    let reload = !preview;
    try {
      if (preview)
        setLocalPlans((all) =>
          all.map((x) => (x.id === target.id ? { ...x, status: "cancelled", version: x.version + 1 } : x)),
        );
      else await cancelPlan(planGateway, { id: target.id, version: target.version });
    } catch (e) {
      failure = e instanceof PlanSaveError ? e.message : "Could not cancel. Refresh and try again.";
      // As on My resbites: a definite failure reloads first; an uncertain one keeps what is shown.
      reload = !preview && e instanceof PlanSaveError && !e.uncertain;
    }
    working.current = false;
    if (reload) await load();
    if (failure) setError(failure);
    else setNotice(preview ? "Preview plan cancelled." : "Your plan is cancelled.");
    setBusy(false);
  }
  const plan = preview ? (localPlans.find((p) => p.id === planId) ?? null) : (snapshot?.plan ?? null);
  const role: EventRole | null = !plan ? null : preview || plan.owner_id === userId ? "owner" : "invitee";
  return {
    plan,
    role,
    attendee: snapshot?.attendee ?? null,
    guests: snapshot?.guests ?? [],
    busy,
    fresh: preview || fresh,
    error,
    notice,
    pending,
    load,
    respond,
    cancel,
    setNotice,
  };
}
```

- [ ] **Step 3: Write the event page**

`mobile/app/event.tsx`:
```tsx
import React, { useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  ArrowLeft,
  Ellipsis,
  MapPin,
  MessageCircle,
  Pencil,
  RefreshCw,
  Repeat,
  RotateCcw,
  Send,
  Trash2,
  Users,
} from "lucide-react-native";
import { Button, Copy, ErrorNote, s } from "../src/design/ui";
import { AvatarStack, Chip, chipToneFor, CoverCard, IconButton, InfoSheet, Segmented, Tile } from "../src/design/kit";
import { PreviewNotice } from "../src/design/Chrome";
import { categoryIcons } from "../src/design/categories";
import { colors as c } from "../src/design/tokens";
import { categoryLabels } from "../src/domain/categories";
import { eventPicture } from "../src/domain/events";
import { againConflict, againDraft, cardChips, mapsUrl, responseText } from "../src/domain/eventView";
import { canEditPlan } from "../src/domain/plans";
import { answerKey, canReadSample, canRespond, cantMakeItResponse } from "../src/domain/rsvp";
import { drafts } from "../src/services/drafts";
import { useApp } from "../src/state/AppState";
import { useEvent } from "../src/state/useEvent";

/** One page for both roles (spec "Event page"): /event?plan=<id>. */
export default function EventPage() {
  const { plan: planId } = useLocalSearchParams<{ plan?: string }>();
  const { session, preview } = useApp();
  const event = useEvent(planId);
  const [more, setMore] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const { plan, role, attendee, guests, busy, fresh, pending } = event;
  const scope = preview ? "preview" : session?.user.id;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/plans"));

  if (!plan)
    return (
      <SafeAreaView style={s.page}>
        <ScrollView contentContainerStyle={s.body}>
          <IconButton icon={ArrowLeft} label="Back" onPress={back} />
          <ErrorNote message={event.error} />
          {busy ? (
            <Copy accessibilityLiveRegion="polite">Opening your resbite…</Copy>
          ) : (
            !event.error && <Copy>This resbite isn’t available.</Copy>
          )}
          {!preview && (
            <IconButton icon={RefreshCw} label="Refresh invitation" busy={busy} onPress={() => void event.load()} />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  const current = plan;
  const owner = role === "owner";
  const editable = owner && canEditPlan(current, session?.user.id, preview);
  const allowed = attendee ? canRespond({ plan: current, attendee }) : false;
  const going = guests.filter((g) => g.response === "accepted");
  const url = mapsUrl(current);
  const chips = cardChips({ owner, status: current.status, response: attendee?.response });

  function ask(message: string, accept: string, onAccept: () => void) {
    if (Platform.OS === "web") {
      if (window.confirm(message)) onAccept();
    } else
      Alert.alert(message, undefined, [
        { text: "Keep draft", style: "cancel" },
        { text: accept, onPress: onAccept },
      ]);
  }
  // Do this again (benchmark row 5): never over an unconfirmed save, and only after asking over a draft.
  async function again() {
    if (!scope) return;
    setMoreError(null);
    const start = async () => {
      try {
        await drafts.put(
          againDraft(current, {
            scope,
            requestId: Crypto.randomUUID(),
            zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            now: new Date(),
          }),
        );
        setMore(false);
        router.push("/arrange");
      } catch {
        setMoreError("Couldn’t start a copy on this device. Try again.");
      }
    };
    try {
      const conflict = againConflict(await drafts.list(scope));
      if (conflict === "blocked")
        setMoreError("Finish the new resbite that’s waiting on this device first. Open it from My resbites.");
      else if (conflict === "replace")
        ask("Replace the unfinished resbite draft on this device?", "Replace", () => void start());
      else await start();
    } catch {
      setMoreError("Couldn’t start a copy on this device. Try again.");
    }
  }
  function invite() {
    if (preview) {
      event.setNotice("Invitations are disabled in design preview. Real invitations need an approved tester account.");
      return;
    }
    router.push({ pathname: "/invitations", params: { plan: current.id } });
  }

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 40 }]}>
        <View style={styles.top}>
          <IconButton icon={ArrowLeft} label="Back" onPress={back} />
          <PreviewNotice dismissible={false} />
        </View>
        <CoverCard
          hero
          picture={eventPicture(current)}
          title={current.title}
          startsAt={current.starts_at}
          place={current.place_label}
          dimmed={current.status === "cancelled"}
          chips={[
            ...chips.map((text) => ({ key: text, text, tone: chipToneFor(text) })),
            ...current.categories.map((key) => ({
              key,
              text: categoryLabels[key],
              category: key,
              icon: categoryIcons[key],
            })),
          ]}
        />
        {url && (
          <Chip
            icon={MapPin}
            tone="aqua"
            text="Open in Maps"
            label={`Open ${current.place_label.trim()} in Maps`}
            onPress={() => void Linking.openURL(url).catch(() => {})}
          />
        )}
        {!!current.description && <Copy>{current.description}</Copy>}
        {!!current.note && <Copy style={s.muted}>{current.note}</Copy>}
        {guests.length > 0 && (
          <AvatarStack names={going.map((g) => g.name)} label={`${going.length} going`} onPress={() => setGuestsOpen(true)} />
        )}
        <ErrorNote message={event.error} />
        {!!event.notice && (
          <Copy accessibilityLiveRegion="polite" style={{ color: c.aquaDark }}>
            {event.notice}
          </Copy>
        )}
        {owner ? (
          <View style={styles.actions}>
            {editable && (
              <>
                <IconButton
                  icon={Pencil}
                  label={`Edit ${current.title}`}
                  disabled={busy}
                  onPress={() => router.push({ pathname: "/arrange", params: { plan: current.id } })}
                />
                <IconButton icon={Send} label="Invite someone" disabled={busy} onPress={invite} />
                <IconButton
                  icon={Users}
                  label="Choose people"
                  disabled={busy}
                  onPress={() => router.push({ pathname: "/people", params: { plan: current.id } })}
                />
              </>
            )}
            <IconButton
              icon={Ellipsis}
              label="More actions"
              disabled={busy}
              onPress={() => {
                setConfirming(false);
                setMoreError(null);
                setMore(true);
              }}
            />
          </View>
        ) : (
          attendee && (
            <View style={{ gap: 12 }}>
              {allowed ? (
                <Segmented
                  label="Your answer"
                  options={[
                    { key: "going", text: "Going" },
                    { key: "cant", text: "Can’t make it" },
                  ] as const}
                  value={answerKey(attendee.response)}
                  onChange={(key) =>
                    void event.respond(key === "going" ? "accepted" : cantMakeItResponse(attendee.response))
                  }
                  disabled={busy || !fresh || pending !== null}
                />
              ) : (
                <Copy>This plan is cancelled or has already started. Responses are closed.</Copy>
              )}
              <View style={styles.actions}>
                {pending && (
                  <IconButton
                    icon={RotateCcw}
                    label="Retry my response"
                    busy={busy}
                    onPress={() => void event.respond(pending.response, pending)}
                  />
                )}
                <IconButton icon={RefreshCw} label="Refresh invitation" busy={busy} onPress={() => void event.load()} />
                {fresh && !pending && canReadSample({ plan: current, attendee }) && (
                  <Chip
                    icon={MessageCircle}
                    tone="status"
                    text="Sample chat"
                    label="View sample conversation"
                    onPress={() => router.push({ pathname: "/sample-chat", params: { plan: current.id } })}
                  />
                )}
              </View>
            </View>
          )
        )}
      </ScrollView>
      <InfoSheet visible={guestsOpen} title="Guests" onClose={() => setGuestsOpen(false)}>
        {guests.map((g) => (
          <View key={g.userId} style={styles.guest}>
            <Copy style={{ flex: 1 }}>{g.name}</Copy>
            <Chip text={responseText(g.response)} tone={g.response === "accepted" ? "aqua" : "neutral"} />
          </View>
        ))}
      </InfoSheet>
      <InfoSheet visible={more} title="More" onClose={() => setMore(false)}>
        <Tile
          icon={Repeat}
          title="Do this again"
          hint="Copies the name, description, vibe, place and note into a new draft"
          onPress={() => void again()}
        />
        <ErrorNote message={moreError} />
        {editable &&
          (confirming ? (
            <View style={styles.confirm}>
              <Copy>Cancel this plan for everyone?</Copy>
              <Button
                title="Yes, cancel plan"
                onPress={() => {
                  setMore(false);
                  setConfirming(false);
                  void event.cancel();
                }}
              />
              <Button title="Keep plan" secondary onPress={() => setConfirming(false)} />
            </View>
          ) : (
            <Tile icon={Trash2} title="Cancel event" onPress={() => setConfirming(true)} />
          ))}
      </InfoSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  guest: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  confirm: { gap: 12, padding: 14, backgroundColor: c.pinkSoft, borderRadius: 16 },
});
```

In `mobile/app/_layout.tsx`, add `<Stack.Screen name="event" />` directly after `<Stack.Screen name="arrange" />`, inside the approved-account protected group.

- [ ] **Step 4: Let `invite.tsx` claim and land on the answer**

Replace `mobile/app/invite.tsx` with the version below. Token retention, the account redirect, the claim and the clearing of the pending invitation are unchanged. Only the RSVP view moves to `/event` (benchmark row 9).
```tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAccount } from "../src/state/AccountState";
import { useApp } from "../src/state/AppState";
import { Back, Button, Copy, Title, ErrorNote, s } from "../src/design/ui";
import { colors as c } from "../src/design/tokens";
import { claimInvitation } from "../src/services/rsvp";

/** Claims an invitation link, then replaces itself with the event page's answer. */
export default function Invite() {
  const { token, plan } = useLocalSearchParams<{
    token?: string;
    plan?: string;
  }>();
  const { session, restoring, preview, rememberInvite, captureSession, signingOut } = useApp();
  const account = useAccount();
  const accountReady = account.status === "approved" && account.reviewed && account.profileReady;
  const userId = session?.user.id;
  const identity = `${userId}:${token}:${plan}:${preview}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const focused = useRef(false),
    generation = useRef(0);
  const resolved = useRef<{ identity: string; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remember = useRef(rememberInvite);
  remember.current = rememberInvite;
  const retained = useRef<{ identity: string; promise: Promise<void> } | null>(null);
  function retainToken() {
    if (retained.current?.identity === identity) return retained.current.promise;
    const promise = currentIdentity.current === identity ? remember.current(token!) : Promise.resolve();
    retained.current = { identity, promise };
    void promise.catch(() => {
      if (retained.current?.promise === promise) retained.current = null;
    });
    return promise;
  }
  useEffect(() => {
    setError(null);
    if (signingOut) {
      retained.current = null;
      return;
    }
    if (!preview && token && /^[a-f0-9]{64}$/.test(token))
      void retainToken().catch(() => {
        if (currentIdentity.current === identity)
          setError("We could not keep this invitation on this device. Keep the original link.");
      });
  }, [identity, token, signingOut]);
  useEffect(() => {
    if (!session || preview || signingOut || accountReady || account.status === "checking") return;
    let active = true;
    const preserve = token && /^[a-f0-9]{64}$/.test(token) ? retainToken() : Promise.resolve();
    void preserve
      .then(() => {
        if (active) router.replace("/account");
      })
      .catch(() => {
        if (active) setError("We could not keep this invitation. Keep the original link and try again.");
      });
    return () => {
      active = false;
    };
  }, [identity, accountReady, account.status, signingOut]);
  const load = useCallback(async () => {
    if (!userId || preview || signingOut || !accountReady) return;
    const assertSession = captureSession();
    const run = ++generation.current;
    const valid = () => {
      try {
        assertSession();
      } catch {
        return false;
      }
      return focused.current && currentIdentity.current === identity && generation.current === run;
    };
    setBusy(true);
    setError(null);
    try {
      if (token) {
        if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("This invitation link is incomplete.");
        await retainToken();
        if (!valid()) return;
      }
      let id = resolved.current?.identity === identity ? resolved.current.id : token ? undefined : plan;
      if (!id && token) {
        assertSession();
        id = await claimInvitation(token);
        if (!valid()) return;
        resolved.current = { identity, id };
      }
      if (token && id) {
        if (valid()) await remember.current(null, token);
        if (!valid()) return;
      }
      if (!id) throw new Error("Invitation unavailable. Open the original invitation link.");
      // The claim lands straight on the answer (benchmark row 9).
      router.replace({ pathname: "/event", params: { plan: id } });
    } catch (e) {
      if (valid()) setError(e instanceof Error ? e.message : "Invitation unavailable.");
    } finally {
      if (valid()) setBusy(false);
    }
  }, [identity, plan, token, userId, preview, signingOut, captureSession, accountReady]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void load();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void load();
        else ++generation.current;
      });
      return () => {
        focused.current = false;
        ++generation.current;
        sub.remove();
      };
    }, [load]),
  );
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <Back />
        <Title>You’re invited.</Title>
        {!session && !restoring && (
          <>
            <Copy>
              Sign in with your tester account. We’ll keep this invitation ready while you finish setting up.
            </Copy>
            <Button title="Sign in" onPress={() => router.push("/auth")} />
          </>
        )}
        {preview && <Copy>Preview cannot claim invitations or send an RSVP.</Copy>}
        <ErrorNote message={error} />
        {busy && <ActivityIndicator accessibilityLabel="Opening your invitation" color={c.aquaDark} />}
        {session && !preview && (
          <Button title="Refresh invitation" secondary loading={busy} onPress={() => void load()} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 5: Keep the idea on "Do this again" drafts, and route the list to the event page**

In `mobile/src/state/usePlanEditor.ts`:
- Directly before `  const mode: "edit" | "idea" | "blank" = planId`, add:
```ts
  // A "Do this again" draft (key "new") keeps the idea it came from (its picture and source).
  const [restoredActivity, setRestoredActivity] = useState<string | null>(null);
```
- Change `  const sourceId = original ? original.activity_id : (activity ?? null);` to `  const sourceId = original ? original.activity_id : (activity ?? restoredActivity);`.
- In the load and restore effect, after `    setRestored(false);`, add `    setRestoredActivity(null);`. After `          setRestored(true);`, add `          if (!planId && !activity) setRestoredActivity(stored.activityId);`.

In `mobile/app/(tabs)/plans.tsx`:
- Add `import { draftRoute } from "../../src/domain/eventView";`.
- In the "Continue draft" button, replace the `params: d.planId ? { plan: d.planId } : d.activityId ? { activity: d.activityId } : {}` expression with `params: draftRoute(d)`. A "Do this again" draft has key `new` and an idea, so it must reopen `/arrange` without `activity`.
- In the "View invitation" button, change `pathname: "/invite"` to `pathname: "/event"`.

- [ ] **Step 6: Move `verify-rsvp.mjs` to the event page**

In `mobile/scripts/verify-rsvp.mjs`:
1. Change both `` `${base}/invite?plan=${plan.id}` `` to `` `${base}/event?plan=${plan.id}` ``.
2. Change every `.getByRole("button", { name: "I’ll be there", exact: true }).click()` to `.getByRole("radio", { name: "Going", exact: true }).click()`.
3. Replace the `"Your response: declined"` assertion with:
```js
  await expect(page.getByRole("radio", { name: "Can’t make it", exact: true })).toBeChecked();
```
4. Replace the assertion that the "Can’t make it" button has count 0 while a retry is pending with:
```js
  await expect(page.getByRole("radio", { name: "Can’t make it", exact: true })).toBeDisabled();
```
5. Replace the assertion that the "I’ll be there" button has count 0 after the cancellation with:
```js
  await expect(page.getByRole("radio", { name: "Going", exact: true })).toHaveCount(0);
```
"Refresh invitation", "Retry my response" and "View sample conversation" keep their labels. `/invite?token=…` now lands on `/event`, where the sample chip is the "View sample conversation" button.

- [ ] **Step 7: Run the checks**

Restart Expo web with `--clear`, which regenerates the typed routes for `/event`, then run `cd mobile && npm run check`.
Expected: a clean typecheck, with 192 tests passing.

Run:
```bash
for s in verify-event verify-rsvp verify-account verify-planning verify-steps verify-covers; do echo "== $s"; node scripts/$s.mjs || echo "FAILED: $s"; done
```
Expected: every PASS line and no `FAILED:` line. `verify-account` is unchanged and still passes: `/invite?token=` claims, then the event page shows "Fixture café".

- [ ] **Step 8: Commit**

```bash
git add mobile/app/event.tsx mobile/src/state/useEvent.ts mobile/src/services/rsvp.ts mobile/app/invite.tsx mobile/app/_layout.tsx mobile/src/state/usePlanEditor.ts "mobile/app/(tabs)/plans.tsx" mobile/scripts/verify-event.mjs mobile/scripts/verify-rsvp.mjs
git commit -m "Open every resbite on one event page and land invitation claims on the answer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: My resbites as cover cards with Upcoming and Past

**Files:**
- Replace: `mobile/app/(tabs)/plans.tsx`
- Modify: `mobile/scripts/qa-helpers.mjs` (list helpers now use the event page), `mobile/scripts/verify-planning.mjs`, `mobile/scripts/verify-catalogue.mjs`, `mobile/scripts/verify-people.mjs`

**Interfaces:**
- Consumes:
  - Task 1: `cardChips`, `cardLabel`, `coverNotice`, `draftRoute` and `groupPlans`;
  - Task 3: `CoverCard`, `Chip`, `chipToneFor`, `Fab`, `IconButton`, `Segmented` and `Tile`;
  - Task 6: the `/event?plan=` route.
- Produces:
  - `qa-helpers.mjs` gains `card(page, title)` and `openEvent(page, title)`. `editEvent`, `inviteFromList`, `cancelFromList`, `expectCancelled`, `choosePeople`, `closeToList` and `expectCategories` switch to the event page with the same signatures.
- Labels (exact):
  - the header "Upcoming" or "Past", and "Your profile";
  - the radio group "Show" with "Upcoming" and "Past";
  - "New resbite" (Fab);
  - cards labelled by `cardLabel`;
  - draft tiles: "Continue draft, {title}" (", a save needs checking" when pending), with chip "Draft" or "Check save";
  - chip-toasts: "Resbite saved", "Changes saved", "Preview saved" and "Preview changes saved";
  - "Refresh plans";
  - the empty state: "Nothing planned", with tiles "Start" (label "Start a new resbite") and "Ideas" (label "Browse ideas");
  - an empty Past: "Nothing here yet.".

- [ ] **Step 1: Move the list helpers to the event page (the tests now fail)**

In `mobile/scripts/qa-helpers.mjs`, replace everything from the line `// --- My resbites helpers` to the end of the file with:
```js
// --- My resbites helpers: cards open the event page, where the actions now live (UX1) ---
/** A My resbites card, found by its composed label ("{title}, {date}, …"). */
export function card(page, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return visible(page.getByRole("button", { name: new RegExp(`^${escaped}, `) }));
}
export async function openEvent(page, title) {
  await card(page, title).first().click();
  await expect(heading(page, title)).toBeVisible();
}
export async function editEvent(page, title) {
  await openEvent(page, title);
  await button(page, `Edit ${title}`).click();
  await expect(heading(page, "Looks good?")).toBeVisible();
}
export async function inviteFromList(page, title, notice) {
  await openEvent(page, title);
  await button(page, "Invite someone").click();
  await expect(page.getByText(notice, { exact: false })).toBeVisible();
  await button(page, "Back").click();
}
export async function cancelFromList(page, title) {
  await openEvent(page, title);
  await button(page, "More actions").click();
  await button(page, "Cancel event").click();
  await button(page, "Yes, cancel plan").click();
  await expect(page.getByText(/cancelled\.$/)).toBeVisible();
  await button(page, "Back").click();
}
/** Cancelled events leave Upcoming and stay visible under Past with a Cancelled chip (benchmark row 15). */
export async function expectCancelled(page, title) {
  await expect(card(page, title)).toHaveCount(0);
  await page.getByRole("radio", { name: "Past", exact: true }).click();
  await expect(card(page, title)).toHaveAttribute("aria-label", /, Cancelled, /);
  await page.getByRole("radio", { name: "Upcoming", exact: true }).click();
}
export async function choosePeople(page, title) {
  await openEvent(page, title);
  await button(page, "Choose people").click();
}
/** Leaves an unchanged editor (opened from the event page) and returns to My resbites. */
export async function closeToList(page) {
  await close(page);
  await button(page, "Back").click();
}
/** The categories an event shows, for example "Natural · Community", read on its event page. */
export async function expectCategories(page, title, text) {
  await openEvent(page, title);
  for (const label of text.split(" · ")) await expect(visible(page.getByText(label, { exact: true }))).toBeVisible();
  await button(page, "Back").click();
}
```

In `mobile/scripts/verify-planning.mjs`:
1. Add `card` to the `./qa-helpers.mjs` import.
2. In the legacy block, replace the `"YOU’RE ORGANISING"` assertion (with its comment) with:
```js
    await expect(card(legacy, "Coffee together")).toBeVisible();
```
3. In the blank block, directly after the "My resbites" tab click, add:
```js
  // Empty state: an illustration, "Nothing planned" and two tiles.
  await expect(blank.getByText("Nothing planned", { exact: true })).toBeVisible();
  await expect(button(blank, "Start a new resbite")).toBeVisible();
  await expect(button(blank, "Browse ideas")).toBeVisible();
```
4. In the `refresh` scenario:
   - replace the `"Alex · pending"` assertion with `await expect(fixture.getByText("1 going", { exact: true })).toHaveCount(0);`;
   - replace the `"Alex · accepted"` assertion with `await expect(fixture.getByText("1 going", { exact: true })).toBeVisible();`;
   - replace `"Make room for a first plan."` with `"Nothing planned"`.

In `mobile/scripts/verify-catalogue.mjs`, in the preview loop, replace the first `heading` assertion after `later(preview.page)` (the role "heading" named `item.title`) with:
```js
    await expect(card(preview.page, item.title).first()).toBeVisible();
```
Add `card` to its `./qa-helpers.mjs` import.

In `mobile/scripts/verify-people.mjs`:
1. Add `button` to the `./qa-helpers.mjs` import.
2. After each of the two clicks on the people screen's "My resbites" button, add `await button(page, "Back").click();`. People now opens from the event page, so its back button returns there first.

Run the old screen against these: start Expo web and run `cd mobile && node scripts/verify-planning.mjs`.
Expected: FAIL at the first `later()`: there is no card button named `Coffee together, …` yet.

- [ ] **Step 2: Replace My resbites**

Replace `mobile/app/(tabs)/plans.tsx` with the code below. The draft listing, `refresh`, the AppState foreground reload, request abort and the stale-cover-journal cleanup are copied unchanged. Cancel and invite now live on the event page.
```tsx
import React, { useState, useCallback, useRef, useEffect } from "react";
import { AppState, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Check, Lightbulb, Plus, RotateCcw, UserRound } from "lucide-react-native";
import { activities, artwork } from "../../src/services/catalogue";
import { EventPictureView } from "../../src/design/categories";
import { eventPicture } from "../../src/domain/events";
import { supabase } from "../../src/services/supabase";
import { useApp, LocalPlan } from "../../src/state/AppState";
import { Copy, Title, ErrorNote, Reveal, s, useLargeText } from "../../src/design/ui";
import { Chip, chipToneFor, CoverCard, Fab, IconButton, Segmented, Tile } from "../../src/design/kit";
import { colors as c, fonts, r } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { drafts, type PlanDraft } from "../../src/services/drafts";
import { planCoverStore } from "../../src/services/planCovers";
import { cardChips, cardLabel, coverNotice, draftRoute, groupPlans } from "../../src/domain/eventView";

type Attendee = {
  plan_id: string;
  user_id: string;
  response: string;
  profiles: { display_name: string } | null;
};

export default function Plans() {
  const largeText = useLargeText();
  const { created, updated, cover } = useLocalSearchParams(),
    { preview, localPlans, session } = useApp(),
    [plans, setPlans] = useState<LocalPlan[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [segment, setSegment] = useState<"upcoming" | "past">("upcoming"),
    [attendees, setAttendees] = useState<Attendee[]>([]);
  const scope = preview ? "preview" : session?.user.id;
  const [savedDrafts, setSavedDrafts] = useState<PlanDraft[]>([]);
  const [draftLoadError, setDraftLoadError] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setSavedDrafts([]);
      setDraftLoadError(false);
      if (scope)
        void drafts
          .list(scope)
          .then((items) => {
            if (active) setSavedDrafts(items);
          })
          .catch(() => {
            if (active) setDraftLoadError(true);
          });
      return () => {
        active = false;
      };
    }, [scope]),
  );
  const identity = useRef(scope);
  identity.current = scope;
  const [loadedFor, setLoadedFor] = useState<string>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setPlans([]);
    setAttendees([]);
    setLoadedFor(undefined);
    setError(null);
    setBusy(false);
  }, [scope]);
  const refresh = useCallback(async () => {
    request.current?.abort();
    if (preview || !session) {
      setPlans([]);
      setAttendees([]);
      setBusy(false);
      return;
    }
    const uid = session.user.id;
    const controller = new AbortController();
    request.current = controller;
    const isCurrent = () => identity.current === uid && request.current === controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setBusy(true);
    setError(null);
    try {
      const [p, a] = await Promise.all([
        supabase.from("plans").select("*").order("starts_at").abortSignal(controller.signal),
        supabase
          .from("attendees")
          .select("plan_id,user_id,response,profiles(display_name)")
          .abortSignal(controller.signal),
      ]);
      if (!isCurrent()) return;
      if (p.error) throw p.error;
      if (a.error) throw a.error;
      setLoadedFor(uid);
      setPlans(p.data || []);
      // Cover changes for cancelled or started plans can never complete; drop them quietly.
      void planCoverStore.discardStaleCoverJournals(uid, p.data || []).catch(() => {});
      setAttendees((a.data || []) as unknown as Attendee[]);
    } catch (e) {
      if (isCurrent())
        setError(
          "We couldn’t refresh your plans. Previously loaded details may be out of date. Try again when you’re connected.",
        );
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) setBusy(false);
    }
  }, [preview, session?.user.id]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      let previous = AppState.currentState;
      const subscription = AppState.addEventListener("change", (next) => {
        if (next === "active" && previous !== "active") void refresh();
        previous = next;
      });
      return () => {
        subscription.remove();
        request.current?.abort();
        request.current = null;
      };
    }, [refresh]),
  );
  const list = preview ? localPlans : loadedFor === session?.user.id && session ? plans : [];
  const now = Date.now();
  const { upcoming, past } = groupPlans(list, now);
  const shown = segment === "upcoming" ? upcoming : past;
  const myDrafts = savedDrafts.filter((d) => d.scope === scope);
  const start = () => router.push("/arrange");
  const open = (p: LocalPlan) => {
    router.setParams({ created: "0", updated: "0", cover: "none" });
    router.push({ pathname: "/event", params: { plan: p.id } });
  };
  const toast =
    updated === "1"
      ? preview
        ? "Preview changes saved"
        : "Changes saved"
      : created === "1"
        ? preview
          ? "Preview saved"
          : "Resbite saved"
        : null;
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: 110 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={busy} onRefresh={refresh} />}
      >
        <View style={styles.header}>
          <Title>{segment === "past" ? "Past" : "Upcoming"}</Title>
          <IconButton icon={UserRound} label="Your profile" onPress={() => router.navigate("/profile")} />
        </View>
        <PreviewNotice />
        <Segmented
          label="Show"
          options={[
            { key: "upcoming", text: "Upcoming" },
            { key: "past", text: "Past" },
          ] as const}
          value={segment}
          onChange={setSegment}
        />
        <Fab placement="inline" onPress={start} />
        {toast && (
          <Reveal style={{ alignSelf: "flex-start" }}>
            <View accessibilityLiveRegion="polite">
              <Chip icon={Check} tone="aqua" text={toast} />
            </View>
          </Reveal>
        )}
        <ErrorNote message={coverNotice(cover)} />
        {draftLoadError && (
          <ErrorNote message="Couldn’t load drafts from this device. Reopen this tab to try again." />
        )}
        {segment === "upcoming" && myDrafts.length > 0 && (
          <ScrollView
            horizontal={!largeText}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.drafts}
          >
            {myDrafts.map((d) => (
              <DraftTile key={d.key} draft={d} />
            ))}
          </ScrollView>
        )}
        <ErrorNote message={error} />
        {error && <IconButton icon={RotateCcw} label="Refresh plans" busy={busy} onPress={() => void refresh()} />}
        {busy && list.length === 0 && <Copy accessibilityLiveRegion="polite">Loading your plans…</Copy>}
        {shown.length === 0 && !busy && !error ? (
          segment === "upcoming" ? (
            <View style={styles.empty}>
              <Image
                source={artwork["get-out-with-bikes"]}
                style={{ height: 180, width: "100%" }}
                resizeMode="contain"
              />
              <Copy style={styles.emptyTitle}>Nothing planned</Copy>
              <View style={[styles.emptyTiles, largeText && { flexDirection: "column" }]}>
                <View style={styles.emptyTile}>
                  <Tile icon={Plus} title="Start" label="Start a new resbite" onPress={start} />
                </View>
                <View style={styles.emptyTile}>
                  <Tile icon={Lightbulb} title="Ideas" label="Browse ideas" onPress={() => router.navigate("/create")} />
                </View>
              </View>
            </View>
          ) : (
            <Copy style={s.muted}>Nothing here yet.</Copy>
          )
        ) : (
          shown.map((p) => {
            const owner = preview || p.owner_id === session?.user.id;
            const mine = attendees.find((a) => a.plan_id === p.id && a.user_id === session?.user.id);
            const going = attendees.filter((a) => a.plan_id === p.id && a.response === "accepted").length;
            const chips = cardChips({ owner, status: p.status, response: mine?.response ?? "pending", going });
            return (
              <CoverCard
                key={p.id}
                picture={eventPicture(p)}
                title={p.title}
                startsAt={p.starts_at}
                place={p.place_label}
                dimmed={p.status === "cancelled"}
                chips={chips.map((text) => ({ key: text, text, tone: chipToneFor(text) }))}
                label={cardLabel({ title: p.title, startsAt: p.starts_at, place: p.place_label, chips }, new Date(now))}
                onPress={() => open(p)}
              />
            );
          })
        )}
      </ScrollView>
      <SafeAreaView edges={["bottom"]} pointerEvents="box-none" style={styles.fabLayer}>
        <Fab placement="float" onPress={start} />
      </SafeAreaView>
    </SafeAreaView>
  );
}

/** A compact draft tile: "Draft" chip and title; tapping continues it. */
function DraftTile({ draft }: { draft: PlanDraft }) {
  const title =
    draft.title?.trim() || activities.find((a) => a.id === draft.activityId)?.title || "Your resbite";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={draft.pending ? `Continue draft, ${title}, a save needs checking` : `Continue draft, ${title}`}
      onPress={() => router.push({ pathname: "/arrange", params: draftRoute(draft) })}
      style={({ pressed }) => [styles.draft, pressed && { opacity: 0.85 }]}
    >
      <EventPictureView
        picture={eventPicture({ activity_id: draft.activityId, categories: draft.categories ?? [] })}
        size={44}
      />
      <View style={{ flexShrink: 1, gap: 6 }}>
        <Chip text={draft.pending ? "Check save" : "Draft"} tone={draft.pending ? "pink" : "status"} />
        <Copy style={{ fontFamily: fonts.medium, fontSize: 14 }} numberOfLines={2}>
          {title}
        </Copy>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  drafts: { gap: 10 },
  draft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    maxWidth: 280,
    padding: 12,
    borderRadius: r.tile,
    backgroundColor: c.cream,
  },
  empty: { gap: 20, paddingVertical: 24 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, textAlign: "center" },
  emptyTiles: { flexDirection: "row", gap: 12 },
  emptyTile: { flex: 1 },
  fabLayer: { position: "absolute", right: 20, bottom: 20 },
});
```

- [ ] **Step 3: Run the checks**

Run: `cd mobile && npm run check`
Expected: a clean typecheck, with 192 tests passing.

Restart Expo web with `--clear`, then run:
```bash
for s in verify-planning verify-covers verify-catalogue verify-people verify-steps verify-event verify-rsvp verify-kit; do echo "== $s"; node scripts/$s.mjs || echo "FAILED: $s"; done
```
Expected: every PASS line and no `FAILED:` line. `verify-planning`'s first test now proves the Past segment shows the cancelled event with a "Cancelled" chip (through `expectCancelled`).

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(tabs)/plans.tsx" mobile/scripts/qa-helpers.mjs mobile/scripts/verify-planning.mjs mobile/scripts/verify-catalogue.mjs mobile/scripts/verify-people.mjs
git commit -m "Show My resbites as cover cards with Upcoming, Past, drafts and a floating new button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Create tab and idea detail

**Files:**
- Replace: `mobile/app/(tabs)/create.tsx`, `mobile/app/activity/[id].tsx`
- Modify: `mobile/src/design/categories.tsx` (remove `CategoryFilterTile`), `mobile/scripts/verify-catalogue.mjs`, `mobile/scripts/verify-planning.mjs`, `mobile/scripts/verify-people.mjs`

**Interfaces:**
- Consumes: Task 3's `Chip`, `IconButton` and `Tile`; the existing `useCatalogue`, `filterActivities`, `activityArtwork` and `categoryIcons`.
- Produces:
  - the grid test ID `idea-grid`;
  - Create tab labels: the heading "Create", "Search" ("Close search" while open), "Your profile", "Start from scratch", "All ideas" (chip "All"), the category chips and "Clear search";
  - idea detail labels: "Back" and the pill "Use idea".
- Removed text: the brand row, "What shall we do together?", "Plan anything with your people, or borrow an idea.", "Or start from an idea", the "N ideas" count line, "Small plans. More time together.", "Make it your own" and "You can change anything next".

- [ ] **Step 1: Update the browser checks to the new tab (they now fail)**

`mobile/scripts/verify-catalogue.mjs`:
1. Replace `"Start your own resbite"` with `"Start from scratch"`.
2. Replace every `"Use this idea"` with `"Use idea"`.
3. Replace both `await expect(preview.page.getByText("11 ideas", { exact: true })).toBeVisible();` with:
```js
  await expect(preview.page.getByTestId("idea-grid").getByRole("button")).toHaveCount(11);
```
4. Replace `await expect(preview.page.getByText("1 ideas", { exact: true })).toBeVisible();` with:
```js
    await expect(preview.page.getByTestId("idea-grid").getByRole("button")).toHaveCount(1);
```
5. Replace the click on the button named `"Create"` (the idea detail's back button, before the `for (const item of additions)` loop) with:
```js
  await button(preview.page, "Back").click();
  // The search field sits behind the search icon (spec "Create tab").
  await button(preview.page, "Search").click();
```

In `mobile/scripts/verify-planning.mjs` and `mobile/scripts/verify-people.mjs`, replace every `"Use this idea"` with `"Use idea"`.

Start Expo web and run `cd mobile && node scripts/verify-catalogue.mjs`.
Expected: FAIL waiting for the button named "Start from scratch".

- [ ] **Step 2: Replace the Create tab**

Replace `mobile/app/(tabs)/create.tsx` with:
```tsx
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router } from "expo-router";
import { LayoutGrid, Plus, Search, Sparkles, UserRound, X } from "lucide-react-native";
import { Button, Copy, ErrorNote, Title, s, useLargeText } from "../../src/design/ui";
import { Chip, IconButton, Tile } from "../../src/design/kit";
import { categoryPalette, colors as c, depth, fonts, r } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { activityArtwork } from "../../src/services/catalogue";
import { useCatalogue } from "../../src/state/useCatalogue";
import { filterActivities } from "../../src/domain/rules";
import { categoryKeys, categoryLabels, type CategoryKey } from "../../src/domain/categories";
import { categoryIcons } from "../../src/design/categories";
import { useApp } from "../../src/state/AppState";

/** The Create tab (spec "Create tab and idea detail"): start from scratch, or pick an idea. */
export default function Create() {
  const largeText = useLargeText();
  const { preview, session } = useApp(),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState<CategoryKey | "all">("all"),
    [searching, setSearching] = useState(false);
  const catalogue = useCatalogue();
  const results = useMemo(
    () => filterActivities(catalogue.items, query, category),
    [catalogue.items, query, category],
  );
  if (!preview && !session) return <Redirect href="/" />;
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          !preview ? (
            <RefreshControl refreshing={catalogue.loading} onRefresh={catalogue.refresh} tintColor={c.aquaDark} />
          ) : undefined
        }
      >
        <View style={styles.top}>
          <View style={styles.header}>
            <Title>Create</Title>
            <View style={styles.headerActions}>
              <IconButton
                icon={searching ? X : Search}
                label={searching ? "Close search" : "Search"}
                onPress={() => {
                  if (searching) setQuery("");
                  setSearching(!searching);
                }}
              />
              <IconButton icon={UserRound} label="Your profile" onPress={() => router.navigate("/profile")} />
            </View>
          </View>
          <PreviewNotice />
          {searching && (
            <View style={styles.search}>
              <Search size={20} color={c.muted} />
              <TextInput
                accessibilityLabel="Search ideas"
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Search ideas"
                placeholderTextColor={c.muted}
                style={styles.searchInput}
              />
            </View>
          )}
          <Tile
            size="large"
            icon={Plus}
            title="Start from scratch"
            hint="Opens a new resbite you name yourself"
            onPress={() => router.push("/arrange")}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Chip
            text="All"
            icon={LayoutGrid}
            label="All ideas"
            selected={category === "all"}
            onPress={() => setCategory("all")}
          />
          {categoryKeys.map((key) => (
            <Chip
              key={key}
              text={categoryLabels[key]}
              icon={categoryIcons[key]}
              category={key}
              selected={category === key}
              onPress={() => setCategory(key)}
            />
          ))}
        </ScrollView>
        <View style={styles.list}>
          {catalogue.loading ? (
            <View style={{ paddingVertical: 30, gap: 14 }}>
              <ActivityIndicator accessibilityLabel="Loading activities" color={c.aquaDark} />
              <Copy>Finding a little inspiration…</Copy>
            </View>
          ) : catalogue.error ? (
            <View style={{ paddingVertical: 20, gap: 14 }}>
              <ErrorNote message={catalogue.error} />
              <Button title="Try ideas again" onPress={catalogue.refresh} />
            </View>
          ) : catalogue.items.length === 0 ? (
            <View style={[s.card, { padding: 22, gap: 14 }]}>
              <Sparkles size={26} color={c.aquaDark} />
              <Copy>No ideas are available yet. You can still start your own.</Copy>
              <Button title="Check for ideas" onPress={catalogue.refresh} secondary />
            </View>
          ) : results.length === 0 ? (
            <View style={{ paddingVertical: 30, gap: 14 }}>
              <Copy>No ideas match that search.</Copy>
              <Chip
                text="Clear search"
                tone="aqua"
                onPress={() => {
                  setQuery("");
                  setCategory("all");
                }}
              />
            </View>
          ) : (
            <View testID="idea-grid" style={styles.grid}>
              {results.map((a) => (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityLabel={a.title}
                  onPress={() => router.push({ pathname: "/activity/[id]", params: { id: a.id } })}
                  style={({ pressed }) => [styles.card, largeText && { width: "100%" }, pressed && { opacity: 0.9 }]}
                >
                  <View style={[styles.art, { backgroundColor: categoryPalette[a.categories[0] ?? "community"].tint }]}>
                    <Image source={activityArtwork(a)} resizeMode="contain" style={{ width: "100%", height: 134 }} />
                  </View>
                  <View style={styles.cardPanel}>
                    <Copy style={styles.cardTitle}>{a.title}</Copy>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { padding: 24, gap: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerActions: { flexDirection: "row", gap: 8 },
  search: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: r.tile,
    paddingHorizontal: 15,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: c.ink, paddingVertical: 15 },
  filters: { paddingHorizontal: 24, gap: 8, paddingBottom: 19 },
  list: { paddingHorizontal: 24, paddingTop: 4, gap: 17 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: {
    width: "47.8%",
    boxShadow: depth.card,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: r.tile,
    overflow: "hidden",
    backgroundColor: c.paper,
  },
  art: { height: 149, justifyContent: "center" },
  cardPanel: { padding: 12 },
  cardTitle: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
});
```

In `mobile/src/design/categories.tsx`, delete `CategoryFilterTile` and its `filter` style. Remove the imports that become unused: `Pressable`, `Copy`, `fonts` and `colors as c`.

- [ ] **Step 3: Replace the idea detail**

Replace `mobile/app/activity/[id].tsx` with:
```tsx
import React from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Clock3 } from "lucide-react-native";
import { activityArtwork } from "../../src/services/catalogue";
import { Button, Copy, ErrorNote, Title, Reveal, s, useLargeText } from "../../src/design/ui";
import { Chip, IconButton } from "../../src/design/kit";
import { useCatalogue } from "../../src/state/useCatalogue";
import { useApp } from "../../src/state/AppState";
import { categoryPalette, colors as c, r } from "../../src/design/tokens";
import { PreviewNotice } from "../../src/design/Chrome";
import { categoryIcons } from "../../src/design/categories";
import { categoryLabels } from "../../src/domain/categories";

/** Idea detail (spec "Create tab and idea detail"): picture, title, chips, description, numbered tips, "Use idea". */
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { preview } = useApp();
  const largeText = useLargeText();
  const catalogue = useCatalogue(id ?? "");
  const a = catalogue.items[0];
  const back = () => (router.canGoBack() ? router.back() : router.replace("/create"));
  const top = (
    <View style={styles.top}>
      <IconButton icon={ArrowLeft} label="Back" onPress={back} />
      <PreviewNotice />
    </View>
  );
  if (catalogue.loading || catalogue.error || !a)
    return (
      <SafeAreaView style={s.page}>
        <ScrollView contentContainerStyle={s.body}>
          {top}
          <Title>{catalogue.loading ? "Getting your activity…" : "Activity unavailable"}</Title>
          {catalogue.loading ? (
            <ActivityIndicator accessibilityLabel="Loading activity" color={c.aquaDark} />
          ) : (
            <>
              {catalogue.error ? (
                <ErrorNote message={catalogue.error} />
              ) : (
                <Copy>
                  This activity is not available to plan right now. Browse the other ideas, or start your own.
                </Copy>
              )}
              <Button title="Check activity again" onPress={catalogue.refresh} secondary />
              <Button title="Browse ideas" onPress={() => router.replace("/create")} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  const planAction = (
    <View style={[s.actionFooter, largeText && { paddingHorizontal: 0, borderTopWidth: 0 }]}>
      <Button title="Use idea" onPress={() => router.push({ pathname: "/arrange", params: { activity: a.id } })} />
    </View>
  );
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 28 }]}>
        {top}
        <Reveal>
          <View style={[styles.picture, { backgroundColor: categoryPalette[a.categories[0] ?? "community"].tint }]}>
            <Image
              accessibilityLabel={a.title}
              source={activityArtwork(a)}
              style={{ width: "100%", height: 230 }}
              resizeMode="contain"
            />
          </View>
        </Reveal>
        <Title>{a.title}</Title>
        <View style={styles.chips}>
          {a.categories.map((key) => (
            <Chip key={key} text={categoryLabels[key]} icon={categoryIcons[key]} category={key} />
          ))}
          {a.durationMinutes !== null && <Chip icon={Clock3} text={`${a.durationMinutes} minutes`} />}
        </View>
        <Copy>{a.description}</Copy>
        {a.tips.map((tip, i) => (
          <View key={i} style={styles.tip}>
            <View style={styles.tipNumber}>
              <Copy style={{ fontSize: 12, color: c.aquaDark }}>{i + 1}</Copy>
            </View>
            <Copy style={{ flex: 1, fontSize: 14 }}>{tip}</Copy>
          </View>
        ))}
        {preview && <Copy style={s.muted}>Activity content approved for the owner-only beta.</Copy>}
        {largeText && planAction}
      </ScrollView>
      {!largeText && planAction}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  picture: { borderRadius: r.card, alignItems: "center", padding: 20, overflow: "hidden" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tip: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    padding: 14,
    borderRadius: r.tile,
    backgroundColor: c.aquaSoft,
  },
  tipNumber: {
    minWidth: 27,
    minHeight: 27,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.paper,
  },
});
```

- [ ] **Step 4: Run the checks**

Run: `cd mobile && npm run check`
Expected: a clean typecheck, with 192 tests passing.

Restart Expo web with `--clear`, then run:
```bash
for s in verify-catalogue verify-planning verify-people verify-steps verify-kit; do echo "== $s"; node scripts/$s.mjs || echo "FAILED: $s"; done
```
Expected: every PASS line and no `FAILED:` line. `verify-catalogue` still covers the empty, offline and retry states, the published-only catalogue, the 11 preview ideas through `idea-grid`, the three illustrated additions, and the unpublish and deep-link gates at 320 and 390 px.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(tabs)/create.tsx" "mobile/app/activity/[id].tsx" mobile/src/design/categories.tsx mobile/scripts/verify-catalogue.mjs mobile/scripts/verify-planning.mjs mobile/scripts/verify-people.mjs
git commit -m "Simplify the Create tab and idea detail into tiles, chips and Use idea

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Invitations and People restyle; capture every screen

**Files:**
- Modify: `mobile/app/invitations.tsx` (imports, two states, the share notice, a helper and the render), `mobile/app/people.tsx` (imports, one state and the render)
- Replace: `mobile/scripts/review-ui.mjs`
- Modify: `mobile/scripts/verify-invitations.mjs`, `mobile/scripts/verify-people.mjs`

**Interfaces:**
- Consumes: Task 3's `Chip`, `ChipTone`, `IconButton`, `InfoSheet` and `Tile`; Task 5's `qa-helpers.mjs` (`button`, `heading`, `next`).
- Produces (behaviour unchanged; labels exact):
  - Invitations:
    - the heading "Invitations", plus "Back" and "About invitation links" (sheet "Invitation links", holding the three former paragraphs verbatim);
    - "Choose people" and "Prepare a separate link" (+);
    - "Invite another", shown after a share in this visit (benchmark row 14);
    - per person: "Prepare link for {name}", "Retry link for {name}", "Share link for {name}", "Revoke link for {name}" and "Retry revocation for {name}";
    - status chips "No link", "Not confirmed", "Ready", "Shared", "Revoking" and "Revoked", whose labels keep the former status lines.
  - People:
    - the heading "Choose people", "Your group" or "People & groups", plus "Back" and "About people" (sheet "About people");
    - "Create a group" and "Choose phone contacts";
    - "Contact access settings", "Add {group}", "Edit {group}", "Delete {group}" and "Add person";
    - "Review invitations";
    - chips "{n} person/people", "Limited access" (label "Only contacts you allowed are shown.") and "{n} skipped" (label "{n} contacts without a usable email or phone were skipped.").

- [ ] **Step 1: Update the browser checks (they now fail)**

`mobile/scripts/verify-invitations.mjs`:
1. After the `@playwright/test` import, add `import { button } from "./qa-helpers.mjs";`.
2. Directly after the assertion that `fixtureShares[0].text` is the `resbite://invite?token=` message, add:
```js
  // Row 14: the shared link reads "Shared", and "Invite another" stays on screen.
  await expect(page.getByText("Shared", { exact: true })).toBeVisible();
  const sharesBefore = await page.evaluate(() => window.fixtureShares.length);
  await page.getByRole("button", { name: "Invite another", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.fixtureShares.length)).toBe(sharesBefore + 1);
  await expect(page.getByRole("button", { name: "Share link for Invitation 1", exact: true })).toBeVisible();
```
3. After the click on "Prepare a separate link", change the expected button to `"Share link for Invitation 2"`. "Invitation 1" now comes from "Invite another"; the later held share of "Invitation 1" is unchanged.
4. Replace the click on the button named `"My resbites"` with `await button(page, "Back").click();`.
5. Change the final heading assertion's name from `"A little invitation."` to `"Invitations"`.

`mobile/scripts/verify-people.mjs`: replace each click on the buttons named `"Profile"` (two) and `"My resbites"` (two) with `await button(page, "Back").click();`. Task 7's following "Back" clicks stay.

Replace `mobile/scripts/review-ui.mjs` with:
```js
// Captures every UX1 screen at 390 and 320 px in preview with no console or page errors,
// and keeps the gluestack keyboard-selection check. Every Supabase request is aborted.
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { button, heading, next } from "./qa-helpers.mjs";
const base = process.env.RESBITE_QA_URL || "http://localhost:8081";
const out = process.env.RESBITE_QA_SHOTS || "/private/tmp/resbite-ui-audit";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.RESBITE_QA_BROWSER || "chrome" });
try {
  for (const width of [390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const shot = (name) => page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await page.goto(base);
    await page.getByText("Preview the design", { exact: true }).click();
    await expect(heading(page, "Create")).toBeVisible();
    await shot("create");
    // Idea detail, and an idea opening at Review.
    await page.getByRole("button", { name: "Coffee together", exact: true }).click();
    await expect(heading(page, "Coffee together")).toBeVisible();
    await shot("idea");
    await button(page, "Use idea").click();
    await expect(heading(page, "Looks good?")).toBeVisible();
    await shot("review-idea");
    await button(page, "Close").click();
    await button(page, "Back").click();
    // My resbites, empty.
    await page.getByRole("tab", { name: "My resbites", exact: true }).click();
    await expect(page.getByText("Nothing planned", { exact: true })).toBeVisible();
    await shot("plans-empty");
    // The four steps, Review, the Invite screen and invitations.
    await button(page, "New resbite").click();
    await shot("step-what");
    await page.getByLabel("Name", { exact: true }).fill("Picnic in the park");
    await next(page);
    await shot("step-when");
    await next(page);
    await page.getByLabel("Meeting place", { exact: true }).fill("Riverside park");
    await shot("step-where");
    await next(page);
    await page.getByRole("checkbox", { name: "Natural", exact: true }).click();
    await shot("step-vibe");
    await next(page);
    await shot("step-review");
    await button(page, "Create preview").click();
    await expect(heading(page, "It’s on!")).toBeVisible();
    await shot("invite-screen");
    await button(page, "Invite people").click();
    await expect(heading(page, "Invitations")).toBeVisible();
    await shot("invitations");
    await button(page, "About invitation links").click();
    await shot("invitations-about");
    await button(page, "Close sheet").click();
    await button(page, "Back").click();
    // My resbites with a card, the event page, its More sheet and Choose people.
    const card = button(page, /^Picnic in the park, /);
    await expect(card).toBeVisible();
    await shot("plans");
    await card.click();
    await expect(heading(page, "Picnic in the park")).toBeVisible();
    await shot("event");
    await button(page, "More actions").click();
    await shot("event-more");
    await button(page, "Close sheet").click();
    await button(page, "Choose people").click();
    await shot("people-plan");
    await button(page, "Back").click();
    await button(page, "Back").click();
    await page.getByRole("radio", { name: "Past", exact: true }).click();
    await shot("plans-past");
    // Profile, settings and People & groups, with gluestack keyboard selection.
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await shot("profile");
    await page.getByRole("button", { name: "Your data & privacy", exact: true }).scrollIntoViewIfNeeded();
    await shot("settings");
    await page.getByRole("button", { name: "People & groups", exact: true }).click();
    await page.getByRole("button", { name: "Create a group", exact: true }).click();
    await shot("people");
    await page.getByLabel("Person’s name", { exact: true }).fill("Alex");
    await page.getByLabel("Email or phone", { exact: true }).fill("alex@example.invalid");
    await page.getByRole("button", { name: "Add person", exact: true }).click();
    const checkbox = page.getByRole("checkbox", { name: "Alex, alex@example.invalid", exact: true });
    await expect(checkbox).toBeChecked();
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("heading", { name: "Selected · 0", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Uncaught Error");
    if (errors.length) throw Error(errors.join("\n"));
    await page.close();
  }
  console.log(
    "PASS: every UX1 screen at 390/320 px, gluestack keyboard selection, no console/page errors. Screenshots: " + out,
  );
} finally {
  await browser.close();
}
```

Start Expo web and run `cd mobile && node scripts/verify-invitations.mjs`.
Expected: FAIL waiting for the text "Shared".

- [ ] **Step 2: Restyle invitations**

In `mobile/app/invitations.tsx`:
1. Replace `import { Users, Link2, Trash2 } from "lucide-react-native";` with:
```ts
import { ArrowLeft, Info, Link2, Plus, RotateCcw, Send, Share2, Trash2, Users } from "lucide-react-native";
```
2. Add `StyleSheet` to the `react-native` import. Replace the `../src/design/ui` import with `import { Button, Copy, ErrorNote, Title, s } from "../src/design/ui";`. Add `import { Chip, IconButton, InfoSheet, Tile, type ChipTone } from "../src/design/kit";`. Change the tokens import to `import { colors as c, fonts } from "../src/design/tokens";`.
3. After `const [busy, setBusy] = useState(false);`, add:
```ts
  const [about, setAbout] = useState(false);
  // Links shared during this visit (delivery is never confirmed): "Shared" chips and "Invite another" (row 14).
  const [shared, setShared] = useState<ReadonlySet<string>>(new Set());
```
4. In `prepare()`, replace:
```ts
        if (isCurrent())
          setNotice(
            result?.action === Share.dismissedAction
              ? "Share sheet closed. Your link is still ready."
              : "Share sheet completed. Delivery and RSVP are not confirmed.",
          );
```
with:
```ts
        if (isCurrent()) {
          const completed = result?.action !== Share.dismissedAction;
          if (completed) setShared((old) => new Set(old).add(slot.id));
          setNotice(
            completed
              ? "Share sheet completed. Delivery and RSVP are not confirmed."
              : "Share sheet closed. Your link is still ready.",
          );
        }
```
5. After `function revoke(…) { … }`, add:
```ts
  // A separate link; "Invite another" prepares one and opens the share sheet at once.
  function prepareSeparate(share = false) {
    void prepare(
      `manual:${Crypto.randomUUID()}`,
      `Invitation ${slots.filter((i) => i.targetKey.startsWith("manual:")).length + 1}`,
      share,
    );
  }
```
6. Replace the component's `return ( … );` (from `return (` to the end of `Invitations`) with:
```tsx
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 }]}>
        <View style={styles.top}>
          <IconButton
            icon={ArrowLeft}
            label="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/plans"))}
          />
          <PreviewNotice dismissible={false} />
          <IconButton icon={Info} label="About invitation links" onPress={() => setAbout(true)} />
        </View>
        <Title>Invitations</Title>
        <ErrorNote message={error} />
        {Boolean(notice) && (
          <Copy accessibilityLiveRegion="polite" style={{ color: c.aquaDark }}>
            {notice}
          </Copy>
        )}
        {loading && <Copy>Loading invitations…</Copy>}
        {!loading && !available && <Button title="Try again" onPress={() => setRetry((n) => n + 1)} />}
        {available && loadedIdentity === identity && (
          <>
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Tile
                  icon={Users}
                  title="Choose people"
                  disabled={busy}
                  onPress={() => router.push({ pathname: "/people", params: { plan: planId } })}
                />
              </View>
              <IconButton icon={Plus} label="Prepare a separate link" disabled={busy} onPress={() => prepareSeparate()} />
            </View>
            {shared.size > 0 && (
              <Tile
                size="large"
                icon={Send}
                title="Invite another"
                hint="Prepares a new separate link and opens the share sheet"
                disabled={busy}
                onPress={() => prepareSeparate(true)}
              />
            )}
            {targets.map((t) => {
              const slot = [...slots].reverse().find((i) => i.targetKey === t.key);
              const status = linkStatus(slot?.state, Boolean(slot && shared.has(slot.id)));
              return (
                <View key={t.key} style={styles.row}>
                  <View style={styles.avatar}>
                    <Copy style={styles.avatarText}>{(t.label.trim()[0] ?? "?").toLocaleUpperCase()}</Copy>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Copy style={{ fontFamily: fonts.medium }}>{t.label}</Copy>
                    {Boolean(t.address) && <Copy style={s.muted}>{t.address}</Copy>}
                    <Chip text={status.text} label={status.label} tone={status.tone} />
                  </View>
                  <View style={styles.rowActions}>
                    {slot?.state === "revoking" ? (
                      <IconButton
                        icon={RotateCcw}
                        label={`Retry revocation for ${t.label}`}
                        disabled={busy}
                        onPress={() => revoke(slot)}
                      />
                    ) : (
                      <IconButton
                        icon={slot?.state === "ready" ? Share2 : slot?.state === "pending" ? RotateCcw : Link2}
                        label={
                          slot?.state === "ready"
                            ? `Share link for ${t.label}`
                            : slot?.state === "pending"
                              ? `Retry link for ${t.label}`
                              : `Prepare link for ${t.label}`
                        }
                        disabled={busy}
                        onPress={() => void prepare(t.key, t.label, slot?.state === "ready")}
                      />
                    )}
                    {slot && slot.state === "ready" && (
                      <IconButton
                        icon={Trash2}
                        label={`Revoke link for ${t.label}`}
                        disabled={busy}
                        onPress={() => revoke(slot)}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
      <InfoSheet visible={about} title="Invitation links" onClose={() => setAbout(false)}>
        <Copy>Prepare a separate link for each person, then choose where to share it.</Copy>
        <Copy style={s.muted}>
          Each link is claimed by the first eligible account that opens it. Choose the intended recipient in the share
          sheet; contact details stay on this device. Links currently require Resbite to be installed.
        </Copy>
        <Copy style={s.muted}>
          Removing someone from a group or selection does not revoke a prepared link. Revocation is a separate action.
          Signing out removes these local link records; it does not revoke links already shared.
        </Copy>
      </InfoSheet>
    </SafeAreaView>
  );
}

/** A link's status as a chip; the label keeps the former status line for VoiceOver. */
function linkStatus(
  state: InvitationSlot["state"] | undefined,
  shared: boolean,
): { text: string; label: string; tone: ChipTone } {
  if (state === "ready")
    return shared
      ? { text: "Shared", label: "Shared · delivery not confirmed", tone: "aqua" }
      : { text: "Ready", label: "Link prepared · delivery not confirmed", tone: "aqua" };
  if (state === "pending")
    return { text: "Not confirmed", label: "Preparation not confirmed · retry before sharing or revoking", tone: "pink" };
  if (state === "revoking")
    return { text: "Revoking", label: "Revocation not confirmed · sharing disabled", tone: "pink" };
  if (state === "revoked") return { text: "Revoked", label: "Link revoked", tone: "status" };
  return { text: "No link", label: "No link prepared", tone: "neutral" };
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.line,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.aquaSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bold, color: c.aquaDark },
  rowActions: { flexDirection: "row", gap: 6 },
});
```

- [ ] **Step 3: Restyle People**

In `mobile/app/people.tsx`:
1. Replace the `lucide-react-native` import with:
```ts
import { ArrowLeft, Check, ContactRound, Info, Mail, Pencil, Plus, Settings2, Trash2, UserPlus } from "lucide-react-native";
```
2. Replace the `../src/design/ui` import with `import { Button, Copy, ErrorNote, Field, Title, s } from "../src/design/ui";`. Add `import { Chip, IconButton, InfoSheet, Tile } from "../src/design/kit";`. Change the tokens import to `import { colors as c, fonts, r } from "../src/design/tokens";`. Add `StyleSheet` to the `react-native` import.
3. After `const [dirty, setDirty] = useState(false);`, add `const [about, setAbout] = useState(false);`.
4. Replace everything from `  const row = (p: Person, checked: boolean) => (` to the end of the `People` component with:
```tsx
  const row = (p: Person, checked: boolean) => (
    <GluestackCheckbox
      key={p.key}
      value={p.key}
      isChecked={checked}
      aria-label={`${p.name}, ${p.address}`}
      accessibilityState={{ checked, disabled: busy }}
      accessibilityLabel={`${p.name}, ${p.address}`}
      isDisabled={busy}
      onChange={() => {
        setSelected((old) => togglePerson(old, p));
        setDirty(true);
      }}
      style={{
        minHeight: 56,
        padding: 12,
        borderWidth: 1,
        borderColor: checked ? c.aquaDark : c.line,
        borderRadius: r.tile,
        backgroundColor: checked ? c.aquaSoft : c.paper,
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
      }}
    >
      <View style={[styles.avatar, checked && { backgroundColor: c.aquaDark }]}>
        {checked ? (
          <Check size={18} color={c.paper} />
        ) : (
          <Copy style={styles.avatarText}>{(p.name.trim()[0] ?? "?").toLocaleUpperCase()}</Copy>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Copy>{p.name}</Copy>
        <Copy style={s.muted}>{p.address}</Copy>
      </View>
    </GluestackCheckbox>
  );
  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: 32 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.top}>
          <IconButton
            icon={ArrowLeft}
            label="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          />
          <PreviewNotice dismissible={false} />
          <IconButton icon={Info} label="About people" onPress={() => setAbout(true)} />
        </View>
        <Title>{planId ? "Choose people" : editing ? "Your group" : "People & groups"}</Title>
        {loading && <Copy>Loading your people…</Copy>}
        <ErrorNote message={error} />
        {!loading && !ready && <Button title="Try again" onPress={() => setRetry((n) => n + 1)} />}
        {Boolean(notice) && (
          <Copy accessibilityLiveRegion="polite" style={{ color: c.aquaDark }}>
            {notice}
          </Copy>
        )}
        {ready && (
          <>
            {!choosing && (
              <Tile icon={Plus} title="Create a group" hint="Keep your favourite people together" onPress={() => startGroup()} />
            )}
            {!editing &&
              groups.map((g) => (
                <View key={g.id} style={styles.group}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Copy style={{ fontFamily: fonts.medium, fontSize: 17 }}>{g.name}</Copy>
                    <Chip text={`${g.members.length} ${g.members.length === 1 ? "person" : "people"}`} />
                  </View>
                  {planId ? (
                    <IconButton
                      icon={UserPlus}
                      label={`Add ${g.name}`}
                      disabled={busy}
                      onPress={() => {
                        setSelected((old) => mergePeople(old, g.members));
                        setDirty(true);
                      }}
                    />
                  ) : (
                    <>
                      <IconButton icon={Pencil} label={`Edit ${g.name}`} onPress={() => startGroup(g)} />
                      <IconButton icon={Trash2} label={`Delete ${g.name}`} disabled={busy} onPress={() => removeGroup(g)} />
                    </>
                  )}
                </View>
              ))}
            {!choosing && groups.length === 0 && <Copy>No groups yet. Start with the people you see most.</Copy>}
            {choosing && (
              <>
                {editing && (
                  <Field
                    label="Group name"
                    value={groupName}
                    onChangeText={(v) => {
                      setGroupName(v);
                      setDirty(true);
                    }}
                    maxLength={80}
                    editable={!busy}
                  />
                )}
                <Title style={{ fontSize: 23 }}>Selected · {selected.length}</Title>
                <View style={{ gap: 6 }}>{selected.map((p) => row(p, true))}</View>
                {selected.length === 0 && <Copy style={s.muted}>Choose contacts or add someone below.</Copy>}
                <View style={styles.inline}>
                  <View style={{ flex: 1 }}>
                    <Tile icon={ContactRound} title="Choose phone contacts" disabled={busy} onPress={() => void loadContacts()} />
                  </View>
                  {Platform.OS !== "web" && (
                    <IconButton
                      icon={Settings2}
                      label="Contact access settings"
                      disabled={busy}
                      onPress={() => void Linking.openSettings().catch(() => setError("Could not open Settings."))}
                    />
                  )}
                </View>
                {limited && (
                  <>
                    <Chip text="Limited access" label="Only contacts you allowed are shown." />
                    <Button
                      title="Allow more contacts"
                      secondary
                      disabled={busy}
                      onPress={() => void loadContacts(0, true)}
                    />
                  </>
                )}
                {missing > 0 && (
                  <Chip
                    text={`${missing} skipped`}
                    label={`${missing} contacts without a usable email or phone were skipped.`}
                  />
                )}
                {contacts.length > 0 && <Field label="Search loaded contacts" value={query} onChangeText={setQuery} />}
                {contacts
                  .filter(
                    (p) =>
                      !selected.some((x) => x.key === p.key) &&
                      `${p.name} ${p.address}`.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((p) => row(p, false))}
                {more && (
                  <Button title="Load more contacts" secondary disabled={busy} onPress={() => void loadContacts(offset)} />
                )}
                <View style={[s.card, { padding: 18, gap: 14 }]}>
                  <Field
                    label="Person’s name"
                    value={name}
                    onChangeText={(value) => {
                      setName(value);
                      setDirty(true);
                    }}
                    maxLength={80}
                    editable={!busy}
                  />
                  <Field
                    label="Email or phone"
                    value={address}
                    onChangeText={(value) => {
                      setAddress(value);
                      setDirty(true);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={254}
                    editable={!busy}
                  />
                  <View style={{ alignItems: "flex-end" }}>
                    <IconButton icon={Plus} label="Add person" tone="pink" disabled={busy} onPress={addManual} />
                  </View>
                </View>
                <Button title={editing ? "Save group" : "Save people"} onPress={save} loading={busy} />
                {planId && !dirty && (
                  <Tile
                    icon={Mail}
                    title="Review invitations"
                    disabled={busy}
                    onPress={() => router.navigate({ pathname: "/invitations", params: { plan: planId } })}
                  />
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
      <InfoSheet visible={about} title="About people" onClose={() => setAbout(false)}>
        <Copy>Contact details stay on this device. Nothing is sent automatically.</Copy>
        <Copy style={s.muted}>Groups are private to this account and phone. Signing out removes them from this device.</Copy>
        <Copy style={s.muted}>
          People sharing the same email or phone appear once. Choose one contact detail for each person.
        </Copy>
        {planId && (
          <Copy style={s.muted}>
            {preview
              ? "Preview invitations remain disabled."
              : "Review invitations to prepare a separate link for each person. Nothing is sent automatically."}
          </Copy>
        )}
      </InfoSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  group: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
    borderRadius: r.tile,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.paper,
  },
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.aquaSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 13, color: c.aquaDark },
});
```
Everything above `const row` (loading, contact paging, the leave guard, `perform`, `save` and `removeGroup`) is unchanged.

- [ ] **Step 4: Run the checks**

Run: `cd mobile && npm run check`
Expected: a clean typecheck, with 192 tests passing.

Restart Expo web with `--clear`, then run:
```bash
for s in verify-invitations verify-people review-ui verify-planning verify-kit; do echo "== $s"; node scripts/$s.mjs || echo "FAILED: $s"; done
```
Expected: every PASS line and no `FAILED:` line. Go through `/private/tmp/resbite-ui-audit/*-320.png` and `*-390.png`, one per redesigned screen: no text over photos, no clipped text, one heading per screen.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/invitations.tsx mobile/app/people.tsx mobile/scripts/review-ui.mjs mobile/scripts/verify-invitations.mjs mobile/scripts/verify-people.mjs
git commit -m "Restyle invitations and people with status chips, icon actions and info sheets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Full local verification

**Files:** none expected. Report failures; do not fix them in this task.

- [ ] **Step 1:** Run `cd mobile && npm run check`. Expected: a clean typecheck, then 192 tests passing and 0 failing, and content validation passing.
- [ ] **Step 2:** From the repository root, run `node --experimental-transform-types --test supabase/functions/_shared/*.test.ts`. Expected: 51/51.
- [ ] **Step 3:** Run `./scripts/test-database.sh && ./scripts/test-database.sh --hosted-baseline`. Expected: every file PASSes in both modes. UX1 changes no SQL; this confirms nothing drifted.
- [ ] **Step 4:** With Expo web running (`--clear`), run every browser script from `mobile/`:
```bash
for s in verify-kit verify-steps verify-event verify-covers verify-planning verify-catalogue verify-people verify-invitations verify-rsvp verify-auth verify-account verify-profile verify-session verify-notifications verify-registration verify-signup-callback verify-confirmation verify-deletion verify-emails review-ui; do
  echo "== $s"; node scripts/$s.mjs || echo "FAILED: $s"
done
```
Expected: all 20 scripts print their PASS lines and there are no `FAILED:` lines.
- [ ] **Step 5:** Run `cd mobile && npx expo export --platform ios --output-dir dist-ios`. Expected: the export succeeds. The `/kit` route is in the bundle but redirects when `__DEV__` is false.
- [ ] **Step 6:** Run `git diff --check 6627207...HEAD && git status --short`. Expected: clean, apart from the user's untracked `.agents/`, `.mcp.json`, `reports/`, `research_notes/` and `skills-lock.json` (and `dist-ios/` if it is not ignored; do not stage it).
- [ ] **Step 7:** Run `git diff --stat 6627207...HEAD -- mobile/package.json` and confirm that only the `test` script changed: no dependency was added. Run `git diff 6627207...HEAD --stat -- mobile/app.json mobile/ios supabase` and confirm it is empty: no native or database change.

---

### Task 11: iPhone delivery, owner acceptance and documentation (controller)

**Files:**
- Create: `qa/ux1-2026-10-07/README.md`
- Modify: `docs/implementation-status.md`, `docs/development-handoff-2026-10-07.md`, `docs/milestones/2026-09-23-expanded-private-beta.md`

UX1 has no hosted migration, so there is no database gate. It reaches the phone as JavaScript only.

- [ ] **Step 1: Deliver.** Start Metro with `cd mobile && npx expo start --lan --port 8081 --clear` (stop any web server on 8081 first). Ask the owner to reopen the development build and reload, then run the spec's iPhone acceptance checks:
  1. Create from scratch in four steps.
  2. Create from an idea (it opens on Review).
  3. Edit from the event page.
  4. Invite right after creating.
  5. The Past segment shows a cancelled event.
  6. Do this again.
  7. Open in Maps.
  8. Larger Text on every step.
  9. VoiceOver can create an event end to end.
  10. Reduce Motion.
- [ ] **Step 2: Corroborate before recording.** Accept a reply only after the Metro log shows an iOS bundle served after the reload (an `iOS Bundled … expo-router/entry` line timestamped after the request). A reply without a served bundle is not acceptance (the CE2 lesson); ask the owner to reload and run the checks again.
- [ ] **Step 3: Record.** Write `qa/ux1-2026-10-07/README.md` with:
  - the commit range (`6627207..HEAD`) and the Task 10 counts: 192 mobile tests, 51 backend tests, SQL in both modes, 20/20 browser scripts, iOS export and diff check;
  - the Metro evidence line;
  - the ten checks with the owner's replies verbatim, one per check;
  - any deferred known limitations, including:
    - the browser Larger Text check is a proxy;
    - recent places and drafts are per device;
    - edit saves return to My resbites rather than the event page.
- [ ] **Step 4: Documentation.**
  - Append a dated `## UX refresh UX1 — <acceptance date>` entry to `docs/implementation-status.md`. It covers what shipped (kit, step creation with Review and Invite, My resbites with Upcoming and Past, the event page for both roles, the Create tab and idea detail, the invitations and people restyle, the Preview chip), that no migration and no native rebuild were needed, the Task 10 counts, the owner's replies with a link to the QA record, and what remains: UX2 (Maybe and "Can’t make it now", notification audience and wording, guest list after answering, cover description), each with its own plan and explicit approval before B1 testers, then UX3 and UX4.
  - In `docs/development-handoff-2026-10-07.md`, extend the existing **Update** line under the title so it also links `qa/ux1-2026-10-07/README.md`.
  - Append to the CE section of `docs/milestones/2026-09-23-expanded-private-beta.md`: "UX1 (cover cards, step creation and the event page) shipped on <date>; UX2 rules must land before the second tester joins. See the implementation status."
- [ ] **Step 5:** Commit `qa/ux1-2026-10-07/README.md` and the three docs with the message "Record UX1 iPhone acceptance and the UX refresh status". The message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
