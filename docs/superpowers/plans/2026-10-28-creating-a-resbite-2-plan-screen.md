# Creating a resbite (Plan 2 of 3): the plan screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-step creation flow with one plan screen that creates and edits a resbite: When and Where in sheets, nothing pre-filled, Create always enabled and saying what is missing, "It's on!" after creating, "Save and notify N people" when editing, drafts gone and the idempotent create kept.

**Architecture:**
- **Pure domain first.** `planForm.ts` holds the form shape, what is missing and the exact lines, the When row text, duration shortcuts, the next-day rule and the conversion to the write payload. `whenText.ts` formats "Sat 24 Oct · 19:00 to 22:00" and "Every Thursday" for every screen (Plan 3 and the web page use the same rules). `videoLinks.ts` refuses video-call links.
- **One hook, `usePlanForm`,** replaces `usePlanEditor` (830 lines of draft logic): it loads an idea, a plan to edit or a plan to copy, tracks dirtiness, runs the checks, saves with the create journal, and drives the discard question.
- **Three kit pieces** express the wireframes: `TaskScreen` (X, title, fixed footer), `GrabberSheet` (a sheet with a grabber: backdrop tap, swipe down and Android back close it) and `OpenRow` (a row that reads as a task, a value or a missing item).
- **Drafts go; the journal stays.** A small `createJournal` store keeps the one pending create so a lost reply is reconciled on the next launch, never created twice.

**Tech Stack:** Expo SDK 57 / React Native, expo-router (`usePreventRemove` for leaving, `fullScreenModal` presentation), `@react-native-community/datetimepicker`, `lucide-react-native`, `node:test` with tsx, Playwright for the browser checks.

**Spec:** `docs/superpowers/specs/2026-10-28-creating-a-resbite-design.md`: screens CR-01, CR-B1/B1a, CR-B2, CR-B3, CR-B1c, CR-B1b, CR-04, CR-05; decisions CR-D1, CR-D5, CR-D6, CR-D10, CR-D12, CR-D13, CR-D16; calls CR-P1, P2, P8, P9, P10, P11, P13, P14, P18, P20, P23; rules 1–4, 6, 7, 10; the mockups in `docs/superpowers/specs/2026-10-28-creating-a-resbite-mockups/` (visual target), Figma nodes named per task. Plan 1 (`2026-10-28-creating-a-resbite-1-database.md`) must be merged first: its `create_plan_v4`, `change_plan_v4` and the four new `plans` columns are consumed here.

## Global Constraints

- **Branch** `cr2-plan-screen`, from `main` after Plan 1 merges. Nothing here touches the hosted project, Vercel, EAS or TestFlight.
- **Expo HAS CHANGED.** Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any screen or navigation code (`mobile/AGENTS.md`).
- **Figma first:** each screen task names its wireframe node in file `DTOeOkGCdYWf0e4vlD2j8y`; pull it with the Figma `get_design_context` tool (skill `figma-design-to-code`) before building, and keep the mockup files as the look to match. The wireframes set the layout (CR-D1).
- **Kit:** `mobile/src/design` (`kit.tsx`, `ui.tsx`, `CoverPicker.tsx`, `TickRow.tsx`, `PlanSchedule.tsx`'s picker pieces, `categories.tsx`, `tokens.ts`). New components only as Task 5 lists. VoiceOver labels and hints on every control; Larger Text respected (`useLargeText`); no Reanimated layout animations.
- **Copy** lives in `mobile/src/domain/planCopy.ts`, pinned by its test; curly apostrophes as the app already uses (`Doesn’t repeat`, `isn’t`); UK spelling.
- **Nothing pre-filled** (rule 1): no default start, end, date or place anywhere; `defaultStart` is deleted.
- **Tests:** `node:test` with `node:assert/strict`, run by `node --import tsx <file>`; every new `*.test.ts` is appended to the `test` chain in `mobile/package.json`, and every deleted one removed from it. `npm run check` (typecheck, tests, content) must pass at every commit.
- **Browser checks** on this box: `cd mobile && EXPO_PUBLIC_SUPABASE_URL=https://ewcsgvhuojxdpaspwsrx.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=qa-fixture-key npx expo start --web --port 8081`, then `node scripts/verify-planning.mjs` (headless Chromium, every `*.supabase.co` request intercepted). Never create `mobile/.env.local`. Stop the server by its exact PID.
- **Routes:** `/arrange` takes `activity` (an idea), `plan` (edit) or `again` (copy); `/event` takes `plan`; `/invitations` takes `plan`.

## Review Focus

1. **An end earlier than the start** (22:00 to 02:00) means the next day: the write's `ends_at` is the next morning and the row reads "Sat 24 Oct · 22:00 to Sun 25 Oct 02:00". Pinned in Task 1.
2. **A lost reply on Create:** the app is killed after tapping Create; the next launch finds the journal, reads the plan by its id, and creates it only if it is not there; one resbite exists either way. Pinned in Task 6 (unit) and Task 10 (browser).
3. **`https://zoom.useful.com/x` is allowed; `https://us02web.zoom.us/j/1` and bare `meet.google.com/abc-def` are refused,** in any of the six text fields. Pinned in Task 2.
4. **Editing a resbite made before this build (no end):** the When row shows the start only, Save is refused with "Add a date and time" until an end is chosen, and the saved write carries the end. Pinned in Task 1 and Task 7.
5. **Closing with nothing changed** leaves straight away; closing after one keystroke asks; "Keep editing" returns to the same scroll position with the keyboard closed. Pinned in Task 10.

---

### Task 1: The form, what is missing, and the When text

**Files:**
- Create: `mobile/src/domain/whenText.ts`, `mobile/src/domain/whenText.test.ts`.
- Create: `mobile/src/domain/planForm.ts`, `mobile/src/domain/planForm.test.ts`.
- Create: `mobile/src/domain/planCopy.ts`, `mobile/src/domain/planCopy.test.ts`.
- Modify: `mobile/package.json` (append the three tests).

**Interfaces:**
- Consumes: `CategoryKey`, `validCategories`, `toggleCategory` (`mobile/src/domain/categories.ts`); `EventFields`, `TITLE_MAX`, `DESCRIPTION_MAX` (`events.ts`); `Plan`, `PlanDetails` (`plans.ts`, as Task 3 extends them: write Task 1 against the extended shape and let Task 3 make it compile, or land the type change here if the implementer prefers); `splitLocal`/`joinLocal` (`schedule.ts:85-91`); `Guest` (`services/rsvp.ts`).
- Produces, `whenText.ts`:
  - `shortDate(iso: string, zone: string): string` → `"Sat 24 Oct"` (`Intl.DateTimeFormat("en-GB", {weekday: "short", day: "numeric", month: "short", timeZone: zone})`).
  - `clockTime(iso: string, zone: string): string` → `"19:00"`.
  - `whenLine(startsAt: string, endsAt: string | null, zone: string): string`: `"Sat 24 Oct · 19:00"` with no end; `"Sat 24 Oct · 19:00 to 22:00"` same day; `"Sat 24 Oct · All day"` when the local times are 00:00 and 23:59 on the same day; `"Sat 24 Oct · 22:00 to Sun 25 Oct 02:00"` when the end falls on another day.
  - `repeatLine(startsAt: string, zone: string, repeatWeeks: 1 | 2 | null): string | null` → `"Every Thursday"`, `"Every other Thursday"`, `null`.
  - `repeatChoice(repeatWeeks: 1 | 2 | null): string` → `"Doesn’t repeat"`, `"Every week"`, `"Every 2 weeks"`.
- Produces, `planForm.ts`:
  - `type RepeatWeeks = 1 | 2 | null`; `type PlanForm = { title; description; categories: CategoryKey[]; date: string | null /* "YYYY-MM-DD" */; start: string | null /* "HH:mm" */; end: string | null; repeatWeeks: RepeatWeeks; place: string; placeTbd: boolean; area: string; meetingDetails: string; guestNote: string }`; `EMPTY_FORM: PlanForm`.
  - `type MissingItem = "name" | "when" | "place" | "categories"`; `missingItems(form): MissingItem[]` in screen order (name, when, place, categories); `when` is missing unless date, start and end are all set; `place` unless `placeTbd` or a trimmed place; `name` unless a trimmed title; `categories` unless `validCategories`.
  - `missingLine(items: MissingItem[]): string | null`: `null` for none; `"One thing is missing: a place."`; `"Two things are missing: a date and time, and a place."`; `"Three things are missing: a name, a date and time, and a place."`; `"Four things are missing: a name, a date and time, a place, and one or two categories."` (the phrases `a name`, `a date and time`, `a place`, `one or two categories`; a comma before the final `and` always).
  - `rowMessage(item): string` → `"Add a name"`, `"Add a date and time"`, `"Add a place or choose “To be decided”"`, `"Choose one or two categories"`.
  - `formInstants(form, zone): { starts_at: string; ends_at: string } | null`: ISO instants from date, start and end in `zone`; an end not later than the start is the next day.
  - `whenRowText(form, zone): { line: string; repeat: string | null } | null`: `whenLine(...)` of the instants plus `repeatLine`'s choice text (`"Every week"` / `"Every 2 weeks"`), `null` while incomplete.
  - `applyDuration(form, minutes: 30 | 60 | 120 | 180 | "allDay"): PlanForm`: sets `end` from `start` (crossing midnight allowed); `"allDay"` sets `start = "00:00"`, `end = "23:59"`.
  - `moveStart(form, start: string): PlanForm`: when the new start is at or after the end, the end moves to keep the previous duration (24 h wrap).
  - `formFromIdea(a: { title: string; description: string; categories: CategoryKey[] }): PlanForm`; `formFromPlan(plan: Plan): PlanForm` (splits `starts_at`/`ends_at` in `plan.time_zone`; a null end leaves `end` null; `place` empty when `place_tbd`); `formForAgain(plan: Plan): PlanForm` (title, description, categories, place, placeTbd, area, meeting details, guest note; date, start, end null; `repeatWeeks` null).
  - `detailsFromForm(form, zone): PlanDetails` (title trimmed, `place_label` the trimmed place or `"To be decided"` when `placeTbd`, `place_tbd`, `repeat_weeks`, `note` = meeting details, `area`, `time_zone: zone`, instants).
  - `timeOrPlaceChanged(before: PlanDetails, after: PlanDetails): boolean` (start, end, zone, place label or `place_tbd`).
  - `notifyCount(guests: { response: string }[]): number` (accepted, maybe, pending); `saveLabel(n, changed): string` → `"Save"` when `!changed || n === 0`, `"Save and notify 1 person"`, `"Save and notify 6 people"`; `notifyBanner(n): string | null` → `"6 people will be told about changes to the date, time or place."`, `"1 person will be told…"`, `null` for 0.
- Produces, `planCopy.ts`: `PLAN_COPY` with every string of CR-B1, B2, B3, B1c, B1b, CR-04 and CR-05 as the spec writes them (titles `New resbite` / `Edit resbite`; `Close`; placeholders `Name your resbite`, `What you’ll do together (optional)`, `Add a date and time`, `Add a place`, `Add a note`, `Choose one or two`; `Change photo`; `Create`; `When`, `Date`, `Start time`, `End time`, `Quick duration`, `30 min`, `1 h`, `2 h`, `3 h`, `All day`, `The chat closes 7 days after the end time.`, `Repeats`, `Done`; `Where`, `A café, a park, your place…`, `Recent places`, `Recent`, `To be decided`, `You can change it later`, `Area people see before they reply`, `Meeting details`; `Discard this resbite?`, `Your resbite isn’t created yet. If you close it now, what you entered will be lost.`, `Discard`, `Keep editing`, `Discard changes?`, `If you close now, your changes will be lost.`; `It’s on!`, `Now invite the people you want to come.`, `Invite people`, `Not now`; `Resbite is for meeting in person. Take out the video-call link.`).

- [ ] **Step 1: Write the failing tests** (`whenText.test.ts`, `planForm.test.ts`, `planCopy.test.ts`) with the values above, including: `missingLine` for every count; `formInstants({date: "2026-10-24", start: "22:00", end: "02:00"}, "Europe/London")` → `ends_at` on 25 Oct 02:00 local; `applyDuration` of 3 h from 23:00 → `"02:00"`; `moveStart` from 19:00–22:00 to 23:00 → end `"02:00"`; `whenLine` for the four shapes; `repeatLine("2026-10-29T19:00:00Z", "Europe/London", 2) === "Every other Thursday"`; `formFromPlan` of a plan without an end leaves `end` null; `saveLabel(1, true) === "Save and notify 1 person"`.
- [ ] **Step 2: Run** `cd mobile && node --import tsx src/domain/planForm.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the three modules.
- [ ] **Step 4: Run** the three tests. Expected: PASS.
- [ ] **Step 5: Commit** "Plan form: what is missing, the When text, the copy".

### Task 2: Video-call links are refused

**Files:**
- Create: `mobile/src/domain/videoLinks.ts`, `mobile/src/domain/videoLinks.test.ts`; append to `package.json`.

**Interfaces:**
- Produces: `hasVideoCallLink(text: string): boolean` (case-insensitive; a host of `meet.google.com`, `teams.microsoft.com`, `teams.live.com`, or `zoom.us` and any subdomain, with or without a scheme, bounded by a non-host character); `type PlanFormField = "title" | "description" | "guestNote" | "place" | "area" | "meetingDetails"`; `videoLinkFields(form: PlanForm): PlanFormField[]` in screen order; `VIDEO_CALL_MESSAGE` re-exported from `planCopy`.

- [ ] **Step 1: Write the failing test:** refused: `"join https://meet.google.com/abc-defg-hij"`, `"us02web.zoom.us/j/123"`, `"HTTPS://TEAMS.MICROSOFT.COM/l/x"`, `"teams.live.com/meet/1"`; allowed: `"https://zoom.useful.com/x"`, `"my zoom room at home"`, `"https://maps.app.goo.gl/x"`, `""`; `videoLinkFields` returns `["description", "meetingDetails"]` for a form with links in those two.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** "Refuse video-call links in the plan's text fields".

### Task 3: The plan types and the v4 gateway

**Files:**
- Modify: `mobile/src/domain/plans.ts` (`Plan` `:5-36`, `PlanDetails` `:54`, `PlanGateway` `:118`, `cancelPlan` `:233`), `mobile/src/domain/plans.test.ts`.
- Modify: `mobile/src/services/plans.ts` (`create` `:40`, `update` `:61`, `cancel` `:82`).

**Interfaces:**
- Consumes: Plan 1's `public.create_plan_v4(...)` and `public.change_plan_v4(...)` parameter names.
- Produces:
  - `Plan` gains `place_tbd: boolean`, `repeat_weeks: 1 | 2 | null`, `series_id: string`, `repeats_from: string | null`.
  - `PlanDetails` gains `place_tbd: boolean` and `repeat_weeks: 1 | 2 | null`; `ends_at: string` is required (no longer `string | null`); every builder of a `PlanDetails` in tests updated.
  - `PlanGateway.cancel(input: { id: string; version: number; stopRepeating?: boolean }): Promise<number>`; `cancelPlan(gateway, input)` passes `stopRepeating` through.
  - `services/plans.ts`: `create` calls `create_plan_v4` with `p_place_tbd` and `p_repeat_weeks` added; `update` calls `change_plan_v4` with `p_place_tbd`, `p_repeat_weeks`, `p_note`, `p_area`, `p_cancel: false`; `cancel` calls `change_plan_v4` with every field null, `p_cancel: true`, `p_stop_repeating: Boolean(stopRepeating)`.
  - `writePlan`'s message for a `22023` whose message starts with `End time` is `"Add an end time."`.

- [ ] **Step 1: Update `plans.test.ts`** so the fake gateway records the v4 shape: a create write with `place_tbd: true` reaches `create` with `place_label: "To be decided"`; `cancelPlan(gateway, {id, version, stopRepeating: true})` reaches `cancel` with `stopRepeating: true`; a `22023 "End time required"` maps to `"Add an end time."`. Run: FAIL (type errors).
- [ ] **Step 2: Implement** the types and the three RPC calls.
- [ ] **Step 3: Run** `node --import tsx src/domain/plans.test.ts` and `npm run typecheck`. Expected: PASS (typecheck may fail in `usePlanEditor.ts` on the required end; patch its one builder minimally — the file is deleted in Task 7).
- [ ] **Step 4: Commit** "Plans: the v4 write with a required end, To be decided and the repeat rule".

### Task 4: The create journal

**Files:**
- Create: `mobile/src/services/createJournal.ts`, `mobile/src/services/createJournal.test.ts`, `mobile/src/services/pendingCreate.ts`, `mobile/src/services/pendingCreate.test.ts`; append both tests.

**Interfaces:**
- Consumes: the `KeyStore` and `storage` that `services/drafts.ts` uses today (`createDraftStore(storage)`); `reconcilePlan(gateway, write)` and `PlanSaveError` (`domain/plans.ts:196`, `:125`); `PlanWrite`.
- Produces:
  - `type PendingCreate = { requestId: string; write: PlanWrite; savedAt: string }`.
  - `createJournalStore(storage: KeyStore): { read(scope: string): Promise<PendingCreate | null>; put(scope: string, entry: PendingCreate): Promise<void>; clear(scope: string): Promise<void> }`, key `resbite.create-journal.v1.<scope>`; an unreadable value reads as `null`; writes serialised as the draft store did (`draftStore.ts:38-43`).
  - `export const createJournal = createJournalStore(storage)`.
  - `reconcilePendingCreate(scope: string, gateway: PlanGateway, journal = createJournal): Promise<{ plan: Plan | null }>`: no entry → `{plan: null}`; an entry → `reconcilePlan(gateway, entry.write)` (reads by id, creates only when absent); on success clears the journal and returns the plan; on an error whose `uncertain` is true keeps the entry and returns `{plan: null}`; on a definite error (a `42501`, a `22023`) clears it and returns `{plan: null}`.

- [ ] **Step 1: Write the failing tests:** store round trip, `clear`, corrupt JSON → null; reconcile: a fake gateway whose `read` returns the plan → no `create` call, journal cleared; `read` null → `create` called once, journal cleared; `create` throws `PlanSaveError("…", true)` → entry kept.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** them. Expected: PASS.
- [ ] **Step 5: Commit** "The create journal: one pending create, reconciled on the next launch".

### Task 5: Kit: `TaskScreen`, `GrabberSheet`, `OpenRow`

**Files:**
- Create: `mobile/src/design/TaskScreen.tsx`, `mobile/src/design/GrabberSheet.tsx`, `mobile/src/design/OpenRow.tsx`.
- Modify: `mobile/src/design/kit.tsx` (`CoverCard` `:311`: a new prop), `mobile/app/kit.tsx` (the gallery), `mobile/scripts/verify-kit.mjs`.
- Figma: GL section 13 headers `635:329` and section 5 sheets `534:110` (file `DTOeOkGCdYWf0e4vlD2j8y`); mockups `Main.dc.html`, `M-B1c.dc.html`, `M-B2.dc.html`, `resbite.css`.

**Interfaces:**
- Produces:
  - `TaskScreen({ title: string; onClose: () => void; closeLabel?: string /* "Close" */; line?: string | null; footer: ReactNode; scrollRef?: RefObject<ScrollView>; titleRef?: RefObject<Text>; children })`: a top bar with the X in a 44 × 44 circle at the left (`accessibilityRole="button"`, label `closeLabel`), the centred title (`accessibilityRole="header"`), nothing on the right; a scrolling body inside `KeyboardAvoidingView`; a fixed footer on a hairline with `line` above the footer in the error colour, 13 pt semibold, centred, `accessibilityLiveRegion="polite"`.
  - `GrabberSheet({ visible: boolean; title: string; icon?: LucideIcon; onClose: () => void; label?: string; children })`: a transparent `Modal` (`animationType="slide"`, `onRequestClose={onClose}` for Android back), a dim backdrop whose tap closes, a paper sheet with 28 pt top corners, a grabber (36 × 5, `accessibilityRole="button"`, label `"Close sheet"`), swipe down on the grabber or heading closes (a `PanResponder`, release past 60 pt), the heading with the icon (24 pt, decorative) and the title (Quicksand 24), `onAccessibilityEscape={onClose}`. No X.
  - `OpenRow({ icon: LucideIcon; label: string; placeholder: string; value: string | null; hint?: string | null; state: "open" | "filled" | "missing"; message?: string | null; onPress: () => void; accessibilityLabel: string; rowRef?: RefObject<View>; onLayout? })`: a card row with the icon in a 36 pt circle, the small label, then the bold placeholder (open), the value with the optional second line (filled), a chevron; `open` draws a 1.5 pt dashed purple border on a near-white card; `missing` draws a solid 2 pt error border and the `message` above the card in the error colour; the whole row is one button (`accessibilityRole="button"`, label `accessibilityLabel`, hint the message when missing).
  - `CoverCard` gains `extra?: string` appended to its time line as `" · " + extra`.

- [ ] **Step 1: Add the three components to the kit gallery** (`app/kit.tsx`) in their three states and a `verify-kit.mjs` section that finds the buttons by label (`Close`, `Close sheet`, an `OpenRow` labelled `When, Add a date and time`) and asserts the missing row shows its message text. Run `node scripts/verify-kit.mjs`. Expected: FAIL.
- [ ] **Step 2: Implement** the components to match the mockup CSS (`.task-bar`, `.circle`, `.sheet`, `.grabber`, `.card.row-card`, `.open-item`, `.missing`, `.missing-label`, `.footer`, `.error-line` in `resbite.css`), tokens from `tokens.ts`.
- [ ] **Step 3: Run** `node scripts/verify-kit.mjs` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** "Kit: a task screen, a sheet with a grabber, an open-item row".

### Task 6: `usePlanForm`

**Files:**
- Create: `mobile/src/state/usePlanForm.ts`, `mobile/src/state/planFormModel.ts`, `mobile/src/state/planFormModel.test.ts` (append).

**Interfaces:**
- Consumes: Tasks 1–4; `useCoverPhoto` (`CoverControls`, `commitAfterCreate(planId)`), `fieldsFromActivity` (`usePlanEditor.ts:344-350`, moved here), `useCatalogue` (`activity/[id].tsx:21`), `planGateway`, `readGuests(planId)` (`services/rsvp.ts`), `setGuestNote(planId, text)` (`services/plans.ts:108`), `writePlan`/`reconcilePlan`, `recentPlaces.remember` (`services/recentPlaces.ts`), `usePreventRemove` (`expo-router/react-navigation`, as `usePlanEditor.ts:494`), `useAppState` scope and user.
- Produces:
  - `planFormModel.ts` (pure, tested): `type PlanFormMode = "idea" | "blank" | "edit" | "again"`; `modeFor(params: { activity?: string; plan?: string; again?: string }): PlanFormMode`; `submitCheck(form: PlanForm): { missing: MissingItem[]; videoFields: PlanFormField[] }`; `createWrite(form, zone, requestId): PlanWrite` (`id: requestId`, `activityId`, `details: detailsFromForm`); `editWrite(form, zone, original: Plan): PlanWrite` (`id: original.id`, `version`, zone = the plan's own `time_zone` when the start is unchanged, as `usePlanEditor.ts:633-637`); `afterSaveNotice(mode): string` (`"Changes saved"` for edit).
  - `usePlanForm(params): PlanFormController` where `PlanFormController = { mode; form: PlanForm; set<K extends keyof PlanForm>(key: K, value: PlanForm[K]): void; patch(p: Partial<PlanForm>): void; original: Plan | null; loading: boolean; loadError: string | null; dirty: boolean; attempted: boolean; missing: MissingItem[]; videoFields: PlanFormField[]; zone: string; cover: CoverControls; notifyCount: number; timeOrPlaceChanged: boolean; busy: boolean; error: string | null; created: Plan | null; submit(): Promise<void>; leave: { asked: boolean; keep(): void; discard(): void } }`.
  - Behaviour: `idea` loads the catalogue entry and `formFromIdea`; `edit` reads the plan and its guests (`notifyCount`); `again` reads the plan and `formForAgain`, and the cover picker's fallback is the original's picture (its `cover_path` and `cover_description`); after the create, the existing cover setter in `services/planCovers.ts` assigns that same `cover_path` and description to the new plan, unless the host picked a new photo (one object shared by two plans, as Plan 1's roll does). `zone` is the device zone. `submit()` sets `attempted`; with missing items or video fields it returns without a write. Create: `createJournal.put` → `writePlan(planGateway, write)` (or `reconcilePlan` when the journal already held this request) → `cover.commitAfterCreate(id)` → `setGuestNote` when the note is non-empty → `recentPlaces.remember` for a real place → `createJournal.clear` → `created`. Edit: `writePlan` → `setGuestNote` when the note changed → `router.dismissTo({pathname: "/event", params: {plan, notice}})`. Errors land in `error` as `writePlan` maps them; an `uncertain` failure keeps the journal. `leave` is driven by `usePreventRemove(dirty && !created && !busy)`: the guard sets `asked` and keeps the navigation action; `discard()` dispatches it; `keep()` clears `asked`.

- [ ] **Step 1: Write the failing tests** for `planFormModel.ts`: `modeFor` for each param; `submitCheck` on a form missing when and place → `missing: ["when", "place"]`; `editWrite` keeps the plan's zone when the start is unchanged and uses the device zone when it changed; `createWrite(...).id === requestId`.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement** the model and the hook.
- [ ] **Step 4: Run** the test and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** "usePlanForm: one hook that loads, checks and saves the plan".

### Task 7: The plan screen: New resbite, Edit resbite, missing information, discard, It's on!

**Files:**
- Rewrite: `mobile/app/arrange.tsx`.
- Delete: `mobile/src/state/usePlanEditor.ts`, `mobile/src/design/PlanSteps.tsx`, `mobile/src/domain/steps.ts`, `mobile/src/domain/steps.test.ts` (remove from `package.json`); `defaultStart` and its test from `schedule.ts`/`schedule.test.ts`; `PlanSchedule.tsx` only if Task 8 ends up not using it.
- Modify: `mobile/app/_layout.tsx:141-158` (the `arrange` screen), `mobile/app/event.tsx:166-206` (`again()` becomes `router.push({pathname: "/arrange", params: {again: plan.id}})`; the "Do this again" hint reads `"Copies the name, description, photo, categories, place and meeting details"`).
- Figma: CR-B1 `589:198`, CR-B1a `589:354`, CR-B1c `643:268`, CR-B1b `634:236`, CR-04 `589:390`, CR-05 `589:414`; mockups `Main.dc.html`, `M-B1a`, `M-B1c`, `M-B1b`, `M-04`, `M-05`.

**Interfaces:**
- Consumes: Tasks 1–6; `CoverPicker`, `FieldCard`, `Chip` (`category`, `selected`), `Button`, `TextAction`, `CoverCard`, `announce`, `focusHeading`; `toggleCategory`.
- Produces: the screen at `/arrange`:
  - `TaskScreen` titled `New resbite` (idea, blank, again) or `Edit resbite`; the X runs the leave guard.
  - Body order: cover (`CoverPicker`, with `Change photo` as the link under it), Title (`FieldCard`, display type, multi-line, placeholder `Name your resbite`, max `TITLE_MAX`), Description (`What you’ll do together (optional)`), `OpenRow` When (calendar icon; `whenRowText` → value and `repeat` as the hint), `OpenRow` Where (pin icon; the place, or `To be decided`), Note to guests (`Add a note`, max `GUEST_NOTE_MAX`), `Choose one or two` with the seven category chips (`Chip category selected`, `toggleCategory`, a third tap refused as today). Edit adds a banner (`notifyBanner`) between the cover and the fields when `notifyCount > 0`.
  - Footer: `Button` large `Create`, or `saveLabel(notifyCount, timeOrPlaceChanged)` in edit; the `line` is `missingLine(missing)` once `attempted`.
  - Missing information (CR-B1c): once `attempted`, each missing row shows `state: "missing"` with `rowMessage`; the title and the categories get the same red treatment (a 2 pt error border on the card, the message above); on a refused submit the body scrolls so the first incomplete row sits under the bar (its `onLayout` y), `announce(missingLine)`, then accessibility focus moves to that row; messages clear as rows complete.
  - Video-call links: each offending field shows `VIDEO_CALL_MESSAGE` under it (`ErrorNote`), and submit is refused with no line.
  - Discard (CR-B1b): a `GrabberSheet` titled `Discard this resbite?` with the copy, `Discard` as a red `TextAction`, `Keep editing` as the large button last; in edit mode the title and copy are the `Discard changes?` pair. Opened by `leave.asked`.
  - It's on! (CR-04): when `created`, the screen becomes the moment: no bar, `It’s on!` (Quicksand 36, centred), a `CoverCard` (picture, title, `startsAt`, `endsAt`, the place or `Place to be decided`, `extra` = `"Every week"` / `"Every 2 weeks"` when it repeats), `Now invite the people you want to come.`, fixed `Invite people` (Send icon) and `Not now`. `Invite people` runs `later()` then `router.push({pathname: "/invitations", params: {plan}})` as `arrange.tsx:161-177` does today; `Not now` runs `later()`; Android back and the swipe run `later()` too (`usePreventRemove` while `created`).
  - `_layout.tsx`: `arrange` gets `presentation: "fullScreenModal"` and `animation: reduced ? "fade" : "slide_from_bottom"`.

- [ ] **Step 1: Pull the six wireframes** with `get_design_context` and read the mockups.
- [ ] **Step 2: Implement** `arrange.tsx` on `usePlanForm`, delete the step files, patch `event.tsx`'s `again()` and `_layout.tsx`.
- [ ] **Step 3: Run** `npm run typecheck` and `npm test`. Expected: PASS (the deleted tests removed from the chain).
- [ ] **Step 4: Walk it in the browser** (Expo web, Global Constraints): from an idea, Create with nothing set shows the two-things line and the red rows; typing a title in "Start from scratch" then X shows the discard sheet. Note anything the browser cannot do (native pickers) for Task 10.
- [ ] **Step 5: Commit** "The plan screen: one screen creates and edits a resbite".

### Task 8: The When and Where sheets

**Files:**
- Create: `mobile/src/design/WhenSheet.tsx`, `mobile/src/design/WhereSheet.tsx`.
- Modify: `mobile/app/arrange.tsx` (open them from the two rows).
- Figma: CR-B2 `589:237`, CR-B3 `589:301`; mockups `M-B2.dc.html`, `M-B3.dc.html`.

**Interfaces:**
- Consumes: `GrabberSheet`; `applyDuration`, `moveStart`, `repeatChoice`; `Segmented`, `Chip`, `FieldCard`, `TickRow`; the picker pieces of `PlanSchedule.tsx` (iOS inline date and spinner time, Android dialogs, the web typed field); `recentPlaces.list(scope)`; `AREA_MAX` (`eventDetails.ts:26`), meeting details max 2000.
- Produces:
  - `WhenSheet({ visible; value: Pick<PlanForm, "date" | "start" | "end" | "repeatWeeks">; zone: string; onDone(v: Pick<PlanForm, …>): void; onClose(): void })`: local state, applied only by `Done`; rows `Date`, `Start time`, `End time` as cards (label above value, chevron) each opening its native picker; `Quick duration` chips `30 min`, `1 h`, `2 h`, `3 h`, `All day` (selected when the current end matches); the line `The chat closes 7 days after the end time.`; `Repeats` as a `Segmented` with `Doesn’t repeat`, `Every week`, `Every 2 weeks`; `Done` disabled until date, start and end are set; closing by backdrop, swipe, grabber or Android back discards the sheet's edits.
  - `WhereSheet({ visible; value: Pick<PlanForm, "place" | "placeTbd" | "area" | "meetingDetails">; recent: string[]; onDone; onClose })`: the place `FieldCard` (placeholder `A café, a park, your place…`, max 300), `Recent places` as `TickRow` radios (name, `Recent`), the row `To be decided` / `You can change it later`; choosing a recent row fills the field and clears `placeTbd`; `To be decided` clears the field and sets it; typing clears the radios; then Area (`Area people see before they reply`, max `AREA_MAX`) and Meeting details (max 2000); `Done` disabled until a place is typed or a row chosen.

- [ ] **Step 1: Pull the two wireframes** with `get_design_context`.
- [ ] **Step 2: Implement** both sheets and wire the rows.
- [ ] **Step 3: Run** `npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Walk it in the browser:** When with 19:00 and the `3 h` chip gives `22:00`; `All day` gives the row `Sat 24 Oct · All day`; `Every week` gives the second line; Where with `To be decided` gives the row `To be decided`.
- [ ] **Step 5: Commit** "When and Where sheets".

### Task 9: The Create tab (CR-01)

**Files:**
- Modify: `mobile/app/(tabs)/create.tsx` (heading, the "Start from scratch" button, the chips row).
- Figma: CR-01 `589:114`.

**Interfaces:**
- Produces: the tab root titled `Create`, heading `What do you want to do?`, a secondary `Button` `Start from scratch` (→ `/arrange`), the line `Or start from an idea`, the search the build has (kept above the chips), chips `All` plus the seven categories, then the idea grid. No "Adventure".

- [ ] **Step 1: Pull the wireframe** and implement the order and copy.
- [ ] **Step 2: Run** `npm run typecheck` and `node scripts/verify-kit.mjs`. Expected: PASS.
- [ ] **Step 3: Commit** "Create tab: start from scratch or from an idea".

### Task 10: Drafts out, browser checks in

**Files:**
- Delete: `mobile/src/services/draftStore.ts`, `draftStore.test.ts`, `drafts.ts`, `mobile/src/domain/draftAutosave.ts`, `draftAutosave.test.ts`, `mobile/scripts/verify-steps.mjs`.
- Modify: `mobile/src/domain/eventView.ts` (remove `BLANK_DRAFT_BASELINE` `:224`, `againDraft` `:232`, `againConflict` `:258`, `draftRoute` `:265`) and `eventView.test.ts` (`:4-11`, `:172-232`); `mobile/app/(tabs)/plans.tsx` (draft state `:68-90`, `removeDraft` `:195-202`, the tile `:364-378`, `DraftTile` `:443-470`, styles `:476-492`; on load call `reconcilePendingCreate(scope, planGateway)` and show the notice `"<title> is created."` when it returns a plan); `mobile/src/state/AppState.tsx:130` (`clearDrafts` → `clearJournal: createJournal.clear`); `mobile/src/services/sessionLifecycle.ts:45,124-126` (clear the journal where drafts were cleared); `mobile/src/services/deletionLifecycle.test.ts:14,123`, `mobile/src/services/pushDevice.test.ts:125`; `mobile/package.json` (remove the two tests); `mobile/scripts/qa-helpers.mjs` (replace `createSteps`, `createFromIdea`, `next`, `typeDate` with `openWhen(page)`, `openWhere(page)`, `fillPlan(page, {title, date, start, end, place})`, `createPlan(page, …)`); `mobile/scripts/verify-planning.mjs` (rewrite); `mobile/scripts/verify-deletion.mjs:149-150,266-351`, `verify-session.mjs:53,106,124`, `verify-event.mjs:745-787` (Do this again now lands on the plan screen pre-filled, When empty); `mobile/README.md:47` and `docs/implementation-status.md:45` where they describe the script.

**Interfaces:**
- Consumes: Tasks 4–9.
- Produces: `verify-planning.mjs` walks, with every Supabase request intercepted as today:
  1. from an idea: the plan screen opens with the title filled and When empty; Create → the line `Two things are missing: a date and time, and a place.`, both rows red; When sheet → `Done` disabled until date, start and end; `3 h` chip; `Every week`; Where → `To be decided`; Create → `It’s on!` with the card line ending `· Every week`; `Not now` → My resbites with the resbite on top;
  2. start from scratch: Create → `Four things are missing…`; fill everything; Create → the `create_plan_v4` call carries `p_place_tbd: false`, `p_repeat_weeks: null`, an `ends_at`;
  3. the next-day end: `22:00` to `02:00` → the row shows the end's date;
  4. the discard sheet after a keystroke; `Keep editing` keeps the text; `Discard` leaves; with no change the X leaves at once;
  5. a video-call link in the description refuses Create with the message under the field;
  6. edit: the banner `2 people will be told…`, the button `Save and notify 2 people`; changing only the title → `Save`; a resbite without an end → `Add a date and time` until an end is set;
  7. the journal: a `create_plan_v4` reply that never arrives, then a reload → one `create_plan_v4` call in total after the reconcile read finds the plan; the notice `… is created.`; storage failure on the journal write → the create is not sent and the error shows (as the scenarios at the old `:498-776` did);
  8. accessibility: the missing line is announced (`aria-live`) and focus lands on the first red row.

- [ ] **Step 1: Delete the draft modules** and fix every import; `npm run typecheck` and `npm test` PASS.
- [ ] **Step 2: Rewrite `verify-planning.mjs`** and the helpers; delete `verify-steps.mjs`; fix the other scripts' draft lines.
- [ ] **Step 3: Run** the Expo web server and `node scripts/verify-planning.mjs`, `verify-deletion.mjs`, `verify-session.mjs`, `verify-event.mjs`, `verify-kit.mjs`. Expected: every PASS line; stop the server by PID.
- [ ] **Step 4: Run** `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Drafts are gone; the browser checks walk the plan screen".
