# Creating a resbite (Plan 3 of 3): the resbite page, More and the people list — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The resbite becomes a content page in a fixed order with one labelled row of actions (Invite · Edit · More for hosts; the reply with Change, and More, for guests), a More sheet with Mute and Cancel, a full-page people list with a three-dots sheet per person, admins and mutes wired to the database, the end as the boundary everywhere in the app, and the open link moved to the Invite screen.

**Architecture:**
- **Rules before pixels.** `eventPage.ts` decides, from the plan, the viewer and the clock, who the viewer is (owner, admin, guest), whether the resbite is open, ended or cancelled, which bottom row and which More rows show, the When lines, the people-row text and the cancel question. The screen renders those decisions.
- **Three kit pieces** express the content page: `ContentPage` (cover to the top, Back floating, the bar turning solid with the name), `ActionBar` (the fixed row of labelled pills) and `MenuRow` (a sheet row with an icon). Sheets use Plan 2's `GrabberSheet`.
- **One hook, `useEvent`,** already loads the plan, guests, invitations and requests; it gains the admins, the viewer's mute and the admin and mute actions, and the people list page reuses it.
- **Reminders read the server.** The device's muted set goes; the reminder sync skips plans whose series the person has muted.

**Tech Stack:** Expo SDK 57 / React Native, expo-router, `lucide-react-native`, Supabase JS (RPC and PostgREST embeds), `node:test` with tsx, Playwright for the browser checks.

**Spec:** `docs/superpowers/specs/2026-10-28-creating-a-resbite-design.md`: screens CR-02, CR-06, CR-06a, CR-07, CR-08, CR-09, "The people list"; decisions CR-D3, D4, D7, D8, D9, D11, D14, D15, D16; calls CR-P3, P4, P7, P10 to P12, P15 to P17, P19, P21, P23 to P25; rules 5, 6, 8 to 12; mockups `M-06`, `M-06a`, `M-07`, `M-08`, `M-08r`, `M-People1` in `docs/superpowers/specs/2026-10-28-creating-a-resbite-mockups/`. Plans 1 and 2 must be merged: this plan consumes `plan_admins`, `plan_mutes`, `set_plan_mute`, `appoint_admin`, `remove_admin`, the `plans` columns, `cancelPlan(..., {stopRepeating})`, `whenText.ts`, `GrabberSheet` and the `/arrange?again=` route.

## Global Constraints

- **Branch** `cr3-resbite-page`, from `main` after Plan 2 merges. Nothing here touches the hosted project, Vercel, EAS or TestFlight.
- **Expo HAS CHANGED.** Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any screen or navigation code (`mobile/AGENTS.md`).
- **Figma first:** pull each wireframe named per task with `get_design_context` (skill `figma-design-to-code`) before building; the mockups are the look to match; the wireframes set the layout (CR-D1).
- **Kit:** `mobile/src/design` plus Plan 2's `GrabberSheet`; new components only as Task 3 lists. Every action has a label; icons are decorative (`accessibilityElementsHidden`); tap areas at least 44 × 44 pt; Larger Text respected; no Reanimated layout animations.
- **One entry per action** (rule 5): nothing in the header duplicates the bottom row; nothing on the page duplicates More.
- **Copy** lives in `EVENT_COPY` in `mobile/src/domain/eventPage.ts`, pinned by its test; curly apostrophes (`You’re hosting`, `Can’t go`); UK spelling.
- **Routes:** `/event?plan=`, `/guests?plan=` (new; `/people` is already the Profile's People & groups), `/arrange?plan=` (edit), `/arrange?again=` (copy), `/invitations?plan=`.
- **Tests:** `node:test` with tsx; new `*.test.ts` files appended to the `test` chain in `mobile/package.json`; deleted ones removed. `npm run check` passes at every commit.
- **Browser checks** on this box as Plan 2 states (`npx expo start --web --port 8081` with the QA fixture key, never `mobile/.env.local`, stop by PID).

## Review Focus

1. **Between the start and the end** a guest can still reply and a host can still edit, invite and decide requests; after the end the page is read-only with `Do this again` for hosts. Pinned in Task 1 and Task 8.
2. **An admin who answers Can’t go** sees, after the reload, the guest page: no `You’re an admin`, no host actions. Pinned in Task 8.
3. **Muting** removes this phone's reminders for that resbite in the next sync and unmuting brings them back; the global reminders switch is untouched. Pinned in Task 2.
4. **An unanswered guest** sees counts only, no names, no More and the Going · Maybe · Can’t go control as the bottom row; after answering, names, the reply with Change, and More. Pinned in Task 1 and Task 8.
5. **Cancelling a repeating resbite** sends `p_stop_repeating: false` for "Cancel just this one" and `true` for "Cancel this and stop repeating"; a plain resbite asks the one-button question. Pinned in Task 1 and Task 8.

---

### Task 1: The page rules, and the end as the boundary in the app

**Files:**
- Create: `mobile/src/domain/eventPage.ts`, `mobile/src/domain/eventPage.test.ts` (append to `package.json`).
- Modify: `mobile/src/domain/rsvp.ts:13-18` (`canRespond`), `mobile/src/domain/plans.ts:62-73` (`canEditPlan`), `mobile/src/domain/calendarEvent.ts:55-65` (`canAddToCalendar`), `mobile/src/domain/eventView.ts:176-187` (`groupPlans`) and `cardChips`; their tests (`rsvp.test.ts`, `rules.test.ts:107-118`, `calendarEvent.test.ts`, `eventView.test.ts`).

**Interfaces:**
- Consumes: `Plan` with `place_tbd`, `repeat_weeks`, `series_id` (Plan 2); `whenLine`, `repeatLine` (`whenText.ts`); `Guest`, `InvitedPerson`, `HostRequest` (`services/rsvp.ts`, `useEvent.ts:25-43`); `eventPlace`, `guestArea`, `guestGroups` (`eventView.ts`); `ANSWER_OPTIONS`, `answerKey` (`rsvp.ts`).
- Produces (`eventPage.ts`):
  - `planEnd(plan: { starts_at: string; ends_at?: string | null }): number` (ms; the end, or the start when there is none).
  - `type Viewer = "owner" | "admin" | "guest"`; `viewerRole(plan: { owner_id?: string }, userId: string | null, admins: readonly string[]): Viewer`.
  - `type PageState = "open" | "ended" | "cancelled"`; `pageState(plan, now = Date.now()): PageState`.
  - `type BottomRow = { kind: "host" } | { kind: "again" } | { kind: "reply"; text: string; change: boolean } | { kind: "answer" } | { kind: "none" }`; `bottomRow(i: { role: Viewer; state: PageState; response: string | null }): BottomRow`: host + open → `host`; host + ended or cancelled → `again`; guest + open + no answer (`null` or `"pending"`) → `answer`; guest + open + answered → `reply` with `change: true`; guest + ended + answered → `reply` with `change: false`; otherwise `none`.
  - `replyText(response: string): string` → `"You’re going"`, `"Maybe"`, `"You can’t go"`.
  - `type MoreRow = "calendar" | "mute" | "unmute" | "again" | "changeReply" | "cancel"`; `moreRows(i: { role; state; muted: boolean; response: string | null }): MoreRow[]`: `[]` unless `open`; owner → `calendar`, `mute`/`unmute`, `again`, `cancel`; admin → `calendar`, `mute`/`unmute`, `again`, `changeReply`, `cancel`; guest with an answer → `calendar`, `mute`/`unmute`; an unanswered guest → `[]` (no More).
  - `whenLines(plan, zone: string, now = Date.now()): { line: string; second: string | null }`: `line` is `whenLine(starts_at, ends_at, zone)` plus `" · Ended"` when ended; `second` is `repeatLine(...)`, plus `" · the next one is in My resbites"` when ended and repeating.
  - `placeLine(plan, i: { role; response }): { text: string; maps: boolean }`: `{ text: "Place to be decided", maps: false }` when `place_tbd`; otherwise the existing `eventPlace`/`guestArea` rule (exact for hosts and answered guests, the area before), `maps` only when exact.
  - `hostLabel(role): string | null` → `"You’re hosting"`, `"You’re an admin"`, `null`; `byline(hostName: string): string` → `"Hosted by Ana"`.
  - `peopleCounts(i: { guests: Guest[]; invited: InvitedPerson[]; requests: HostRequest[] }): { going; maybe; cantGo; invited; waiting }` (`invited` counts personal links not answered plus in-app `pending` guests; `waiting` the requests still waiting); `peopleRowText(c, host: boolean): string` → `"Going 6 · Can’t go 1"`, with `" · Maybe 2"` after Going when `maybe > 0`, and for hosts `" · 2 invited"` and `" · 1 waiting"` when above zero; `namesLine(names: string[]): string` → `"Leo, Marta, Sol and 3 more"` (three names, then `and N more`; `"Leo and Marta"`; `"Leo"`).
  - `cancelQuestion(plan, zone): { title: "Cancel this resbite for everyone?"; line: string | null; actions: { key: "cancel"; title: "Yes, cancel resbite"; stop: false }[] | [{ key: "one"; title: "Cancel just this one"; stop: false }, { key: "stop"; title: "Cancel this and stop repeating"; stop: true }]; keep: "Keep resbite" }`: the `line` is `"It repeats every Thursday. Everyone invited will be told."` (`every other Thursday` for 2) only for a repeating plan.
  - `type PersonAction = "makeAdmin" | "removeAdmin" | "remove" | "sendAgain" | "removeInvite" | "approve" | "decline"`; `type PersonRow = { key: string; name: string; status: string | null; admin: boolean; kind: "guest" | "appInvite" | "linkInvite" | "request"; userId?: string; phone?: string; actions: PersonAction[] }`; `peopleGroups(i: { role; guests; invited; requests; admins; sentHere: ReadonlySet<string> }): { title: string; rows: PersonRow[] }[]` in the order `Going · N`, `Maybe · N`, `Can’t go · N`, `Invited, not answered yet · N`, `Waiting for you · N` (the last two for hosts only; empty groups omitted); statuses `"Invited by WhatsApp"` / `"Invited by Messages"` (from the invitation's `via` when known, else `"Invited by link"`), `"Invited in the app"`, `"Asked through the link"`; actions: owner on a Going guest → `makeAdmin` or `removeAdmin`, then `remove`; admin on a guest → `remove`; link invitees → `sendAgain` (only when `sentHere.has(phone)`) and `removeInvite`; app invitees → `remove`; requests → `approve`, `decline`; guests get no actions.
  - `EVENT_COPY`: every string above plus `"People"`, `"Actions for "`, `"Make admin"`, `"Remove as admin"`, `"Remove from this resbite"`, `"Send again on WhatsApp"`, `"Send again on Messages"`, `"Remove"`, `"Approve"`, `"Decline"`, `"Admin"`, `"Invite"`, `"Edit"`, `"More"`, `"Change"`, `"Do this again"`, `"Add to calendar"`, `"Mute this resbite"`, `"Unmute this resbite"`, `"Change my reply"`, `"Cancel resbite"`, `"Your answer"`, `"Your resbite is cancelled."`, `"Or share the event link"`.
- Produces (boundary): `canRespond` is `status === "active" && planEnd(plan) > now`; `canEditPlan(plan, userId?, preview = false, now = Date.now(), admins: readonly string[] = [])` is active, `planEnd > now`, and owner or admin; `canAddToCalendar` uses `planEnd`; `groupPlans` puts a plan in Upcoming while active and `planEnd > now`; `cardChips` adds `"Ended"` for an active plan past its end.

- [ ] **Step 1: Write the failing tests** for every function above, including: `bottomRow` for the nine role/state/answer shapes; `moreRows` for owner, admin, answered guest, unanswered guest, ended; `whenLines` of a repeating plan that ended → `second === "Every Thursday · the next one is in My resbites"`; `peopleRowText({going: 6, maybe: 0, cantGo: 1, invited: 2, waiting: 1}, true) === "Going 6 · Can’t go 1 · 2 invited · 1 waiting"` and with `maybe: 2` → `"Going 6 · Maybe 2 · Can’t go 1 …"`; `cancelQuestion` for both shapes; `peopleGroups` for an owner with a Going admin, a Going guest, a Maybe guest, a link invitee sent here, a link invitee sent elsewhere, an app invitee and a waiting request; `canRespond` true at start + 1 minute with the end an hour away, false at end + 1 minute; `canEditPlan` true for an admin and false for a guest.
- [ ] **Step 2: Run** `node --import tsx src/domain/eventPage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the module and the four boundary changes.
- [ ] **Step 4: Run** the five test files. Expected: PASS.
- [ ] **Step 5: Commit** "Resbite page rules: who sees which row, and the end as the boundary in the app".

### Task 2: Admins and mutes in the app; reminders read the server mute

**Files:**
- Create: `mobile/src/services/admins.ts`, `admins.test.ts`, `mobile/src/services/mutes.ts`, `mutes.test.ts` (append both tests).
- Modify: `mobile/src/services/rsvp.ts` (`readEvent`'s select and `EventSnapshot`), `mobile/src/state/useEvent.ts` (`EventPage` `:25-43`, the role at `:118`, `cancel` `:193-221`), `mobile/src/services/reminderPrefsStore.ts` (drop `muted`, `setMuted`, `MUTED_MAX`), `mobile/src/services/deviceReminders.ts` (`:38`, `muteReminders` `:97`, `syncReminders` `:57`), `mobile/src/services/reminders.ts` (`createReminderSync` `:201`), `mobile/src/domain/eventDevice.ts` (`reminderChip` `:25-47` goes), `mobile/src/state/useEventDevice.ts` (keeps the calendar action, drops the reminder chip), and their tests (`reminderPrefsStore.test.ts`, `reminders.test.ts`, `domain/reminders.test.ts`, `eventDevice.test.ts`).
- Delete: `mobile/src/design/EventDeviceChips.tsx`.

**Interfaces:**
- Consumes: Plan 1's `appoint_admin(p_plan, p_user)`, `remove_admin(p_plan, p_user)`, `set_plan_mute(p_plan, p_muted) returns boolean`, `public.plan_admins` (embed `plan_admins(user_id)`), `public.plan_mutes` (`select series_id`); the fake-client style of `services/contactInvites.test.ts`.
- Produces:
  - `services/admins.ts`: `appointAdmin(planId: string, userId: string): Promise<void>` and `removeAdmin(planId, userId): Promise<void>` (RPC, `withDeadline`, errors mapped as `writeRsvp` maps them).
  - `services/mutes.ts`: `setPlanMute(planId: string, muted: boolean): Promise<boolean>` (RPC); `readMutedSeries(): Promise<Set<string>>` (`plan_mutes` select `series_id`, the viewer's own rows under RLS).
  - `EventSnapshot` gains `admins: string[]` (from the embed); `EventPage` gains `role: Viewer` (`"owner" | "admin" | "guest"`, replacing `"invitee"` everywhere it is read), `admins: string[]`, `muted: boolean` (`readMutedSeries().has(plan.series_id)` at load), `mute(muted: boolean): Promise<void>`, `appoint(userId): Promise<void>`, `demote(userId): Promise<void>`, and `cancel(opts?: { stopRepeating?: boolean })` passing `stopRepeating` to `cancelPlan`; the cancel notice reads `"Your resbite is cancelled."`.
  - Reminders: `syncReminders(scope)` reads `readMutedSeries()` once and passes `plannedReminders` the muted plan ids (plans whose `series_id` is in the set); `muteReminders` and the device muted set are gone; `remindersFor` and `setRemindersEnabled` unchanged.

- [ ] **Step 1: Write the failing tests:** `admins.test.ts` and `mutes.test.ts` with a fake client recording the RPC name and arguments (`appoint_admin {p_plan, p_user}`, `set_plan_mute {p_plan, p_muted}`), `readMutedSeries` turning `[{series_id: "s1"}]` into a `Set`; `reminders.test.ts`: a sync with `mutedSeries = {"s1"}` schedules nothing for a plan with `series_id: "s1"` and schedules for another; `reminderPrefsStore.test.ts` no longer references `muted`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the services, the hook changes and the reminder sync; delete `EventDeviceChips.tsx` (its `event.tsx` use is removed in Task 4; until then leave a one-line stub import removal there).
- [ ] **Step 4: Run** the tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** "Admins and mutes in the app; reminders skip muted resbites".

### Task 3: Kit: `ContentPage`, `ActionBar`, `MenuRow`; the idea page becomes a content page

**Files:**
- Create: `mobile/src/design/ContentPage.tsx`, `mobile/src/design/ActionBar.tsx`, `mobile/src/design/MenuRow.tsx`.
- Modify: `mobile/src/design/GrabberSheet.tsx` (Plan 2): `title` becomes optional and `label` names the sheet for screen readers when there is no title.
- Modify: `mobile/app/activity/[id].tsx` (CR-02 `589:170`), `mobile/app/kit.tsx` (gallery), `mobile/scripts/verify-kit.mjs`.
- Figma: GL 13 `635:329`, GL 5 `534:110`; mockups `M-06.dc.html`, `M-08.dc.html`, `resbite.css` (`.hero`, `.hero .circle`, `.actions`, `.pill`, `.pill.primary`, `.pill.reply`, `.menu-row`, `.menu-sep`).

**Interfaces:**
- Produces:
  - `ContentPage({ title: string; picture: EventPicture; uri?: string | null; pictureLabel?: string; dimmed?: boolean; onBack: () => void; bottom?: ReactNode; children })`: the cover runs under the status bar to the top (`CoverCard`'s picture rendering reused, 230 pt tall); Back floats in a 44 pt paper circle at the top left (label `"Back"`); as the cover scrolls away a solid bar with the title fades in (`Animated.Value` on scroll offset; with `useReduceMotion` the bar appears without a fade); the title in the body is an `accessibilityRole="header"` and receives focus on mount (`focusHeading`); `bottom` is fixed under the scroll.
  - `ActionBar({ actions: { key: string; title: string; icon: LucideIcon; onPress: () => void; primary?: boolean; label?: string }[] })`: a fixed row on a hairline, paper background, pills 56 pt tall with the icon (20 pt, decorative) and the label (bold 16); `primary` is pink; one action spans the width.
  - `ReplyPill({ text: string; onChange?: () => void })` exported from `ActionBar.tsx`: the reply as text with `Change` underlined at the right (one button labelled `"Change your answer"`), or plain text when `onChange` is absent.
  - `MenuRow({ title: string; icon: LucideIcon; onPress: () => void; destructive?: boolean; label?: string })`: 60 pt row, 24 pt icon, semibold 16; `destructive` in the error colour; `MenuSeparator()` an 8 pt band.
  - `activity/[id].tsx` on `ContentPage`: name, category chips, description; fixed `Use idea` (`Button` large) → `/arrange?activity=` as today. No date or place anywhere.

- [ ] **Step 1: Add the components to the gallery** and a `verify-kit.mjs` section (finds `Back`, the pills by label, `Change your answer`, a destructive `MenuRow`). Run it. Expected: FAIL.
- [ ] **Step 2: Implement** the components and the idea page.
- [ ] **Step 3: Run** `node scripts/verify-kit.mjs` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** "Kit: content page, action bar, menu rows; the idea page is a content page".

### Task 4: The resbite page (CR-06, CR-06a, CR-07)

**Files:**
- Rewrite: `mobile/app/event.tsx` (the body from `:362` on; keep the loading states at `:113-129`, the toast `:366-372`, `invite()` `:207-213`, and move the resend logic at `:308-352` into `mobile/src/state/useResend.ts` for Task 6).
- Delete from the page: the chips row (`EventDeviceChips`, `Open in Maps`), `GuestNoteCard`'s edit and `GuestNoteSheet` (the note is edited on the plan screen), `WaitingForYou` (Task 6 moves it), `EventLinkCard` (Task 7 moves it), the Guests `InfoSheet` (`:542-612`), the icon-only buttons (`:468-497`), the inline `Segmented` for answered guests, the `Sample chat` chip.
- Figma: CR-06 `596:148`, CR-06a `643:327`, CR-07 `596:208`; mockups `M-06`, `M-06a`, `M-07`.

**Interfaces:**
- Consumes: Tasks 1–3; `useEvent`; `mapsUrl`, `meetingDetailsView` (`event.tsx:136-146`); `Chip` with `category`; `AvatarStack`'s avatar rendering; `Segmented` and `ANSWER_OPTIONS`.
- Produces the page at `/event?plan=`:
  - `ContentPage` with the cover (`dimmed` when cancelled, the `Cancelled` chip kept as today), then in order: the name; `hostLabel` as an aqua tag for hosts, or `byline(host)` for guests; the When row (calendar icon, small label `When`, `whenLines.line`, `whenLines.second` under it); the Where row (pin icon, `placeLine.text`; a button opening Maps when `placeLine.maps`, with the existing `Couldn’t open Maps.` error); the Note to guests (small label, text; absent when empty); the meeting details as today (`MeetingDetails`) for those who may see them; the people row: a card with `peopleRowText(counts, isHost)` in bold, the avatars and `namesLine` for hosts and answered guests (an unanswered guest sees the counts only, and the card is not a button), tapping opens `/guests?plan=`; the description; the category chips. No Chat row (its place is simply the end of the page).
  - The bottom slot from `bottomRow`: `host` → `ActionBar` Invite (primary, Send, `invite()`), Edit (Pencil, `/arrange?plan=`), More (Ellipsis, opens Task 5's sheet); `again` → one pill `Do this again` (Repeat, `/arrange?again=`); `reply` → `ReplyPill` (with `Change` opening the answer sheet of Task 5) and a More pill when `moreRows` is non-empty; `answer` → the `Segmented` `Your answer` control (Going · Maybe · Can’t go) as the bottom row and no More; `none` → nothing.
  - A guest whose request is still waiting keeps the existing waiting screen.
  - Between the start and the end nothing is hidden (rule 11); after the end only the `again`/`reply` rows remain.

- [ ] **Step 1: Pull the three wireframes** and read the mockups.
- [ ] **Step 2: Implement** the page; `npm run typecheck` PASS; `npm test` PASS (the removed pieces' unit tests, if any, removed from the chain).
- [ ] **Step 3: Walk it in the browser** with the fixtures `verify-event.mjs` uses: the owner sees `Invite`, `Edit`, `More` and `Going 2 · Maybe 1`; a guest sees `Hosted by …` and `You’re going` with `Change`.
- [ ] **Step 4: Commit** "The resbite page: a content page with one row of labelled actions".

### Task 5: More: calendar, Mute, Do this again, Change my reply, Cancel

**Files:**
- Modify: `mobile/app/event.tsx` (the sheets).
- Figma: CR-08 `628:222`, CR-09 `628:311`; mockups `M-08`, `M-08r`.

**Interfaces:**
- Consumes: `moreRows`, `cancelQuestion`, `EVENT_COPY`; `useEventDevice`'s calendar action (`Add to calendar` / `Update calendar` as the device hook names it today); `event.mute`, `event.cancel({stopRepeating})`, `event.respond`; `GrabberSheet`, `MenuRow`, `MenuSeparator`, `Button`, `TextAction`.
- Produces:
  - The More sheet: a `GrabberSheet` (no title, label `"More"`) with `MenuRow`s in `moreRows` order and icons: `Add to calendar` (CalendarPlus), `Mute this resbite` (BellOff) / `Unmute this resbite` (Bell; the row flips in place after `event.mute`), `Do this again` (Copy), `Change my reply` (MessageCircle; swaps the sheet's content for the `Segmented` control, and closes after `respond`; a Can’t go reloads the page, which now shows the guest view), then a separator and `Cancel resbite` (CalendarX, destructive).
  - Cancelling swaps the sheet's content for `cancelQuestion`: the title, the line when repeating, then the actions as large buttons (`Yes, cancel resbite` destructive; or `Cancel just this one` destructive and `Cancel this and stop repeating` secondary in the error colour), then `Keep resbite` secondary; a tap runs `event.cancel({stopRepeating: action.stop})`, closes the sheet and shows the notice.
  - The answer sheet for guests: a `GrabberSheet` titled `Your answer` holding the `Segmented` control; closes after `respond`.

- [ ] **Step 1: Pull the two wireframes.**
- [ ] **Step 2: Implement** the sheets.
- [ ] **Step 3: Run** `npm run typecheck`; walk the owner's More in the browser: the four rows, cancel in place, the repeating variant on a fixture with `repeat_weeks: 1`.
- [ ] **Step 4: Commit** "More: calendar, mute, do this again, change my reply, cancel".

### Task 6: The people list

**Files:**
- Create: `mobile/app/guests.tsx`, `mobile/src/state/useResend.ts` (the resend logic moved from `event.tsx:308-352`: `useResend(plan): { resend(person, via): Promise<void>; sentHere: ReadonlySet<string> }`, `sentHere` from `inviteCodeStore`).
- Modify: `mobile/app/_layout.tsx:141-158` (register `guests` beside `event`), `mobile/app/event.tsx` (the people row navigates).
- Delete: `mobile/src/design/WaitingForYou.tsx` once nothing imports it.
- Mockup: `M-People1.dc.html`; no Figma wireframe.

**Interfaces:**
- Consumes: `useEvent`, `peopleGroups`, `EVENT_COPY`; `invitationGateway.removeGuest`, `contactInviteGateway.revoke`, `joinRequestGateway.decide` (`useEvent`'s `decide` at `event.tsx:252-268`), the confirmation copy `removeGuestQuestion` (`eventLinks.ts:60`), `"Remove the invitation for <name>?"`, and the decline question `"Decline <name>? They’ll see they weren’t added."` with `Keep` / `Decline`; `IconButton`, `GrabberSheet`, `MenuRow`.
- Produces the page at `/guests?plan=`: a top bar with Back (44 pt circle) and the title `People`; the groups from `peopleGroups` with their titles; each row an avatar (initial), the name with an `Admin` badge when `row.admin`, the status under it, and for hosts an `IconButton` Ellipsis (44 pt, label `Actions for <name>`) when `row.actions` is non-empty. The button opens a `GrabberSheet` (no title, label the name) with the avatar, name and status at the top, then one `MenuRow` per action: `Make admin` (UserPlus) / `Remove as admin` (UserMinus) → `event.appoint` / `event.demote`; `Send again on WhatsApp` / `Send again on Messages` (Send) → `resend`; `Approve` (Check) / `Decline` (X) → `decide`, Decline asking in place with the existing copy; `Remove from this resbite` or `Remove` (destructive, last) → the existing in-place confirmation, then `removeGuest` / `revoke`. Guests see the rows without buttons; an unanswered guest never reaches this page (Task 4).

- [ ] **Step 1: Implement** the page, the hook and the registration; delete `WaitingForYou.tsx`.
- [ ] **Step 2: Run** `npm run typecheck` and `npm test`. Expected: PASS.
- [ ] **Step 3: Walk it in the browser:** the owner's list shows the five groups from the `verify-event.mjs` fixtures; `Actions for Bea` opens the sheet; `Make admin` sends `appoint_admin`.
- [ ] **Step 4: Commit** "The people list: groups, and a three-dots sheet per person".

### Task 7: The open link moves to Invite; My resbites marks the end; the About list

**Files:**
- Modify: `mobile/app/invitations.tsx` (a section after line 100: the heading `Or share the event link` and `EventLinkCard`; the header's ⓘ sheet), `mobile/src/domain/eventLinks.ts:88-96` (`LINK_INFO` line 4: `"The event link, with Share, Copy and Turn off, is on the Invite screen."`) and `:22-25`, `mobile/src/domain/eventLinks.test.ts:88-93`.
- Modify: `mobile/app/(tabs)/plans.tsx` (`cardChips` already yields `Ended`; under a host's ended tile a `TextAction` `Do this again` → `/arrange?again=`), `mobile/src/domain/eventView.test.ts` (`cardChips`, `groupPlans`).
- Modify: `mobile/src/domain/notifications.ts:25-32` (`NOTIFICATION_EVENTS` adds `"Being made an admin, to that person."` and `"A repeating resbite’s next date, to everyone invited."`), `mobile/src/domain/notifications.test.ts:176-187`.

- [ ] **Step 1: Update the three tests** (`eventLinks`, `eventView`, `notifications`) to the new values. Run: FAIL.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** "The event link lives on Invite; ended resbites say so; the About list grows".

### Task 8: Browser checks and the records

**Files:**
- Modify: `mobile/scripts/verify-event.mjs` (rewrite the walk), `verify-invitations.mjs` (`:3`, `:65-68`, `:116-149`: the link section is now present), `verify-contact-invites.mjs:368-375,445-460` (send again from the people list), `verify-kit.mjs:46-91`, `verify-people.mjs:47,67`, `verify-rsvp.mjs:141-201`, `review-ui.mjs:108,115,165,359,513-558`, `verify-notifications.mjs:36-50,177` (no Reminders chip), `verify-planning.mjs:666-673,866,891`.
- Modify: `knowledge-base/08-decisions.md` (a "Creating a resbite (CR), 28 October 2026" section listing CR-D1–D16 and CR-P1–P26 in one line each), `docs/implementation-status.md` (the CR build: what is built, what the owner still runs: Plan 1's runbook, the TestFlight build), `mobile/README.md` (the scripts).

**Interfaces:**
- Produces: `verify-event.mjs` walks, with every Supabase request intercepted: the owner's page (`Invite`, `Edit`, `More`; `You’re hosting`; `Going 2 · Maybe 1 · 1 invited · 1 waiting`); More (the four rows; `Mute this resbite` → `set_plan_mute {p_muted: true}` and the row reads `Unmute this resbite`; `Cancel resbite` → `Yes, cancel resbite` → `change_plan_v4 {p_cancel: true, p_stop_repeating: false}`); the repeating fixture (`repeat_weeks: 1`: the second When line `Every Thursday`, the two cancel choices, `Cancel this and stop repeating` → `p_stop_repeating: true`); the ended fixture (`ends_at` in the past: `· Ended`, only `Do this again`, no More); the running fixture (`starts_at` an hour ago, `ends_at` an hour ahead: `Edit` present and a guest reply accepted); the admin fixture (`plan_admins` includes the viewer: `You’re an admin`, `Change my reply`, `Cancel resbite`; answering `Can’t go` then reload → the guest page); the guest page (`Hosted by Ana`, `You’re going` + `Change` → the answer sheet; an unanswered guest: counts only, the `Your answer` control, no More); the people list (groups, `Actions for Bea` → `Make admin` → `appoint_admin`; `Approve` → `decide_join_request`; `Send again on WhatsApp` only for the code this phone holds); the idea page (`Back` over the image, `Use idea`).

- [ ] **Step 1: Rewrite `verify-event.mjs`** and fix the other scripts.
- [ ] **Step 2: Run** the Expo web server and every `verify-*.mjs` touched, plus `review-ui.mjs`. Expected: every PASS line; stop the server by PID.
- [ ] **Step 3: Run** `npm run check`. Expected: PASS.
- [ ] **Step 4: Write** the decisions section, the status entry and the README lines.
- [ ] **Step 5: Commit** "Browser checks walk the new resbite page; the records are updated".
