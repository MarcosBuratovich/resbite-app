# UX refresh: cover cards, step-by-step creation and event-app ideas

Date: 7 October 2026. Status: **approved by the owner on 7 October 2026**, including UX-P1 to UX-P6. UX1 delivered and owner-accepted on 14 October 2026 (see [qa/ux1-2026-10-07/README.md](../../../qa/ux1-2026-10-07/README.md)); one owner-approved refinement: the optional description moved onto the What step (steps v2). Inputs:
- the owner's choices in the visual-companion mockups (7 October 2026);
- the [event creation app benchmark](../../../reports/Event%20creation%20app%20benchmark.md), which compares Apple Invites, Luma and WhatsApp events;
- a map of the current event-screen code.

## Intent

The owner finds today's screens wordy and form-like: "too many text and button text". They want screens that feel like **widgets and components**: minimal, calm and beautiful. At the same time the benchmark showed which event logic is worth copying: Luma's guest path, Apple's privacy defaults and WhatsApp's notification rules. It also showed what to refuse: themes, forwardable links, plus-ones and Luma's host machinery.

**Success:** on the owner's iPhone, a resbite can be created in four short steps plus a review card. My resbites shows picture cards. Each event opens a single event page that works for both the organizer and invitees. Every screen passes the existing Larger Text, VoiceOver and Reduce Motion acceptance checks with fewer words on screen. Event logic (drafts, saving, covers, invitations, RSVP) behaves exactly as before, except for the changes listed in UX2.

## Owner decisions (7 October 2026)

| # | Decision |
|---|---|
| UX-D1 | Visual direction **"Cover cards"**, in the style of Apple Invites: each resbite is a large picture card with its details on a solid panel **below** the picture (never text over a photo). A single floating **+** creates. |
| UX-D2 | Creation is **step cards**, one question per screen: **What** (name, optional photo) → **When** (day tiles and time chips; Pick opens the native picker) → **Where** (place, recent places, optional note) → **Vibe** (the seven category tiles, pick one or two) → **Review** (exactly what guests will see; tap any part to change it) → **Invite** ("Invite people" or "Later"). |
| UX-D3 | Starting from an idea pre-fills the steps and **opens on the Review card**. Editing a saved resbite also opens on the Review card. |
| UX-D4 | The benchmark's recommendations are folded into this work (owner: "with all the new info from the other event apps"). |

**Approved defaults.** The owner approved these with the spec on 7 October 2026 ("approved … and also aprove the 6 choices"):

| # | Proposal |
|---|---|
| UX-P1 | **Scope: event screens first** (UX1): Create tab, idea detail, creation steps, My resbites, event page, invitations and people. Profile, settings and auth adopt the new components later (UX4). |
| UX-P2 | Keep the four tabs (Create, My resbites, Wellness, Profile) with short labels. The tab bar stays native, so labels stay for VoiceOver. My resbites gains the floating +, and the Create tab stays the place for ideas. |
| UX-P3 | **Add Maybe** to RSVP, and show the stored `withdrawn` state as "Can't make it now" (UX2, before B1 testers). |
| UX-P4 | **Narrow notifications:** only a change of time or place notifies, and only accepted, Maybe and not-yet-answered invitees. Cancellation notifies everyone. Notification text says what happened, and never shows the place or note on the lock screen (UX2). |
| UX-P5 | **Guest list after you answer:** an invitee sees who else is coming only after responding. The organizer always sees everyone. This is enforced on the server (UX2). |
| UX-P6 | "Recent places" are the account's last five places, kept **on the device only** and cleared at sign-out like other device data. |

## Design principles (apply to every redesigned screen)

1. **One heading per screen, at most three words.** Remove eyebrow labels ("TIME WELL SPENT", "YOU'RE ORGANISING"), taglines ("Make it a date.") and subtitles.
2. **Actions are icon-first and short.** Primary buttons use one or two words ("Next", "Create", "Invite"). Secondary actions are icon buttons with an accessibility label that carries the full meaning, for example icon "pencil" with the label "Edit Picnic in the park".
3. **Status is a chip, not a sentence:** "Hosting", "Invited", "Going", "Maybe", "Cancelled", "Draft".
4. **Explanations move behind an ⓘ icon** that opens a small sheet, or appear only when something goes wrong. Error, conflict and recovery messages keep their current wording, because they protect data.
5. **No text over photos.** Pictures sit above a solid info panel. There are no themes, host-chosen colours or animated backgrounds.
6. **One primary action per screen.** It is a pill pinned to the bottom, and it moves inline under Larger Text, as today.
7. **Meaning stays available to assistive tech.** When visible text is removed, labels and hints keep it. Required steps announce "required". Chips read as full phrases (for example "Saturday 12 October at 10:00").
8. **Motion is minimal.** Steps slide (and fade under Reduce Motion), presses scale (and don't under Reduce Motion), and nothing loops.

## Component kit (UX1)

These are new shared components in `mobile/src/design/` (a new `kit.tsx`, plus token additions). Existing `Button`, `Field`, `ErrorNote`, `Back`, `Reveal` and the gluestack wrappers stay. Screens are migrated onto the kit, and older components remain until nothing uses them.

| Component | Purpose | Accessibility |
|---|---|---|
| `Chip` | Icon plus a short text in tinted tones (neutral, aqua, pink, category, status); optional press | Role button when pressable; the label can differ from the visible text |
| `Tile` | Rounded selectable tile (day tile, category tile, action tile) with selected and disabled states | Role button or checkbox with selected/checked state; at least 44 pt |
| `IconButton` | 44 pt circle with an icon | A label is required (enforced by the TypeScript type) |
| `Fab` | Floating + above the tab bar | Label "New resbite"; moves inline under Larger Text |
| `CoverCard` | Picture area (cover, idea artwork or category placeholder via `EventPictureView`) over an info panel holding the title, a `DateBadge`, a time/place line and chips | Whole card is one button with a composed label; inner chips are not separately focusable when the card is pressable |
| `DateBadge` | "SAT / 12" block | Read as part of the card label |
| `AvatarStack` | Up to three initial-avatars plus a count | Label "3 going" |
| `Segmented` | Two or three options, such as Upcoming/Past or Going/Maybe/Can't | Role radiogroup/radio with selected state |
| `StepScreen` | Progress bars, a big question title, content, and a pinned primary pill; Back and Close icon buttons | Title is a header; progress is read as "Step 2 of 4" |
| `InfoSheet` | Bottom sheet for ⓘ explanations and short pickers | `accessibilityViewIsModal`; close button |

Token additions: radii (`r.card = 28`, `r.tile = 22`, `r.chip = 999`), a spacing scale, and neutral surface tints (`surface = #F7F4F7`). Category tints and inks stay as approved in CE-D5.

## Screens (UX1)

### Creation steps (`arrange.tsx`)

- **Logic is unchanged:** state, draft autosave, the leave guard, the cover hook, validation, save, pending writes, reconciliation and the post-save routing move into a `usePlanEditor` hook. `arrange.tsx` then only renders steps. Draft keys, the draft schema, `writePlan`/`reconcilePlan`, the cover journal and preview mode stay as they are.
- **What:** a large name input (its accessibility label stays "Name") and a photo tile (the `CoverPicker` actions shown as an icon tile and a sheet). The pending-cover recovery messages stay.
- **When:**
  - Day tiles for Today, Tomorrow, a weekend tile and Pick. The weekend tile is the next Saturday that is neither today nor tomorrow; if tomorrow is Saturday, it is Sunday.
  - Time chips for 09:00, 10:00, 13:00, 18:00 and "⋯" (the native time picker).
  - Times that are already past are disabled.
  - The value keeps the existing `YYYY-MM-DD HH:mm` local format and time zone handling.
  - On web, the existing "Date and time (local)" field stays available behind Pick for tests.
- **Where:**
  - A place input (its label stays "Meeting place").
  - Recent-place chips (UX-P6).
  - A "current location" chip that uses the existing `locate()`.
  - An optional note (its label stays "A note for everyone (optional)").
- **Vibe:** the seven category tiles, with selection rules unchanged (one or two; a third is disabled with a hint). They remain role checkbox with the category name.
- **Review:** a `CoverCard` of the event as guests will see it, plus "+ Description".
  - Tapping the picture, title, date, place or chips jumps to that step.
  - The primary action is **Create** (new event) or **Save** (edit). Preview mode keeps the same pills and labels them "Create preview" and "Save preview".
  - Pending, latest-saved, draft error and retry states appear here with their current wording.
- **Validation:**
  - **Next stays enabled.** Pressing it with a missing required answer shows that step's error inline and announces it.
  - Review re-checks everything and jumps to the first incomplete step.
  - `validateEventFields` and `validatePlan` gain per-step wrappers in `src/domain`; their messages are unchanged.
- **Entry points:**
  - A blank event starts at What.
  - An idea or an edit opens at Review.
  - A restored draft opens at Review if all required answers are present; otherwise it opens at the first missing step.
  - The current step is **not** stored in the draft, and the draft schema is unchanged.
- **After create: Invite screen** (benchmark row 1). The picture, "It's on!", one large "Invite people" tile (goes to invitations) and "Later" (goes to My resbites, with the existing created/cover notices shown as a chip-toast).
- **Removed text:** the header card, eyebrow, H1, tagline, section headings, the "From the idea" tag (replaced by an idea chip on Review), helper lines and the footer lines. Their meaning moves into labels, hints or ⓘ.

### My resbites (`(tabs)/plans.tsx`)

- **Header:** "Upcoming" and the avatar button (to Profile).
- **Segments:** a `Segmented` control with Upcoming (active, future) and Past (started or cancelled; cancelled events stay visible with a "Cancelled" chip, benchmark row 15).
- **List:** `CoverCard`s. Each card carries a role chip ("Hosting" or "Invited") and, for invitees, a status chip. Tapping a card opens the **event page**. The inline actions (Edit plan, Choose people, Invite someone, Cancel plan) move to the event page.
- **Drafts:** a compact row of draft tiles above the list ("Draft" chip, title); tapping one continues it.
- **Creating:** the `Fab` opens a new blank creation flow.
- **Notices:** created, updated and cover notices become short chip-toasts. Cover failure keeps its current wording because it asks for action.
- **Empty state:** an illustration, "Nothing planned", and two tiles, "Start" and "Ideas".

### Event page (new `app/event.tsx`, `/event?plan=<id>`)

One page for both roles. It replaces the invitee view in `invite.tsx`. `invite.tsx` keeps the token claim and then routes to `/event?plan=`, so it lands straight on the answer (benchmark row 9, UI part).

- **Top:** a large `CoverCard` with the description below it and an **Open in Maps** chip on the place (row 6). The chip uses the saved coordinates, or else the place name. It only opens when tapped.
- **Invitee:**
  - A `Segmented` answer control: Going / Can't make it in UX1, plus Maybe in UX2.
  - Choosing Can't make it **after Going** sends `withdrawn`, which is today's "Withdraw my RSVP". Choosing it before ever accepting sends `declined`, which is today's "Can't make it". The stored values and the reconciliation rules don't change.
  - Retry and refresh keep their behaviour as icon buttons with labels.
  - The sample-chat entry becomes an icon chip.
- **Organizer:**
  - Icon actions: Edit (opens creation at Review), Invite (invitations), People, and "More" (an `InfoSheet` with **Do this again** and **Cancel event**).
  - **Do this again** (row 5) creates a new blank-type draft with the title, description, categories, place and note copied. It does not copy the date, guests or cover, and it opens at When.
  - Cancel keeps its confirmation and current semantics.
- **Guests:** an `AvatarStack` plus a list sheet. In UX1 the visibility rule is unchanged (anyone who can read the plan); UX2 applies UX-P5.

### Create tab and idea detail

- **Create tab:** the heading "Create", a large "Start from scratch" tile (opens What), a search icon that expands the search field, category chips (All and the seven) and the idea grid as picture tiles. Removed: the tagline, the subtitle, the "N ideas" count line and the footer line.
- **Idea detail:** a large picture, the title, category and duration chips, the description, and the tips as small numbered cards. The primary pill is **"Use idea"**, which opens Review. The line "You can change anything next" is removed.

### Invitations and people

- **Invitations:** one row per person with an avatar, name, a status chip ("Ready", "Shared", "Revoked") and icon actions (share, revoke). "+" adds a separate link. "Invite another" stays on screen after a share (row 14). The three explanatory paragraphs move into an ⓘ sheet. The link rules don't change.
- **People:** selection tiles and chips. The explanatory lines move to ⓘ. The behaviour and the device-only contacts don't change.

### Preview mode

The aqua bar becomes a small "Preview" chip in the header that opens an `InfoSheet` ("Actions stay on this device") with "Exit preview".

## Benchmark mapping

Row numbers refer to the benchmark report's ranked table.

| Row | Idea | Where | Phase |
|---|---|---|---|
| 1 | Invite step after the first save | Invite screen | UX1 |
| 2 | Clear required items; Save stays enabled and jumps to the missing step | Steps and Review | UX1 |
| 3 | Description for the cover photo | Cover step and new column | UX2 (needs a migration) |
| 4 | "See it as a guest" | Review card is the guest view | UX1 |
| 5 | Do this again | Event page | UX1 |
| 6 | Open in Maps | Event page | UX1 |
| 7 | No themes or text over photos | Principles | UX1 |
| 8 | Private link previews and an accessible fallback page | resbite.com | UX3 (needs B1 links) |
| 9 | Claim lands on the answer | `invite.tsx` → `/event` | UX1 (UI part) |
| 10 | Notification audience | `change_plan_v2` queue | UX2 |
| 11 | Notification wording | Worker copy | UX2 |
| 12 | Guest list after you answer | Server read rule and UI | UX2 |
| 13 | Maybe, and "Can't make it now" | Database, RPC and UI | UX2 |
| 14 | Faster multiple invites | Invitations | UX1 |
| 15 | Cancelled stays visible | My resbites, Past | UX1 |
| 16–20 | Reminder, add to calendar, end time, note to guests, place note for accepted guests only | — | UX3 (B1 and later) |
| 21–24 | Forwardable links, plus-ones, Luma host tools, co-hosts | — | **Avoid** |

## Phases

- **UX1, app only (no database change).** Component kit; creation steps with Review and Invite; My resbites; event page; Create tab and idea detail; invitations and people restyle. Benchmark rows 1, 2, 4, 5, 6, 7, 9, 14 and 15. A JavaScript update to the existing development build, with no native rebuild and no new dependencies.
- **UX2, rules before B1 testers (database migrations, each applied only with explicit owner approval).**
  - Maybe and the withdrawn wording (UX-P3).
  - Notification audience and wording (UX-P4).
  - Guest list after answering (UX-P5).
  - Cover description column.

  Each is designed in detail in its own plan, against the hosted baseline.
- **UX3, with B1 infrastructure:** link previews and the fallback page, then the reminder, calendar, end time, note to guests and place-note visibility.
- **UX4:** Profile, settings, account, auth and Wellness adopt the kit.

## Testing

- **Unit tests** (domain, test-first) for:
  - quick day and time options, including past times disabled, the weekend tile rule, and day boundaries in the user's zone;
  - per-step validation;
  - the composed card and accessibility labels;
  - Upcoming/Past grouping;
  - the Maps URL builder;
  - the "Do this again" draft;
  - the recent-places store (dedupe, limit five, cleared at sign-out).
- **The editor hook extraction** lands before any visual change, and the existing browser scripts must pass unchanged.
- **Browser scripts** are updated to the new flows. Input labels stay stable ("Name", "Meeting place", "A note for everyone (optional)", "Date and time (local)") to limit churn. Changed button labels are updated in `verify-planning`, `verify-covers`, `verify-catalogue`, `verify-people`, `verify-invitations` and `verify-rsvp`. New cases cover:
  - next with a missing answer;
  - entering at Review from an idea and from an edit;
  - jumping from Review to a step;
  - the invite screen;
  - the Past segment with a cancelled event;
  - Do this again;
  - the event page for both roles.
- **`review-ui.mjs`** captures every redesigned screen at 320 and 390 px with no console errors.
- **iPhone acceptance (owner):**
  1. Create from scratch in four steps.
  2. Create from an idea (opens on Review).
  3. Edit from the event page.
  4. Invite right after creating.
  5. The Past segment shows a cancelled event.
  6. Do this again.
  7. Open in Maps.
  8. Larger Text on every step.
  9. VoiceOver can create an event end to end.
  10. Reduce Motion.

## Risks

- **`arrange.tsx` is 956 lines with subtle draft and save behaviour.** Extracting the hook first, with the existing browser scripts unchanged, de-risks the visual split.
- **Fewer visible words can hide meaning.** Principle 7 and the VoiceOver acceptance check guard against it. Error and recovery text keeps its wording.
- **UX2 changes server rules after real use begins.** It must land before the second tester joins.
