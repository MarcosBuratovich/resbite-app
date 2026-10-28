# Creating a resbite: one plan screen

**Date:** 28 October 2026. **Status:** approved by the owner on 28 October 2026 after the builder check (CR-D14) and the mockup review (CR-D15, CR-D16, the people list).
**Builds on:** `main` at `d82a339` (UX1–UX4, GI1, GI2, the four contact-invitation plans; all their migrations are live on the hosted project).
**Figma:** file `DTOeOkGCdYWf0e4vlD2j8y`, page "↳ CR · Creating a resbite". The spec is the dev brief **CR · Dev brief: Creating a resbite V0.7** (node `597:156`) and the wireframes **CR · Option B: one plan screen V0.9** (`589:102`). Headers and sheets follow **GL · Design guidelines V0.5**, sections 5 (`534:110`) and 13 (`635:329`). Background only: the build review and its decisions D1–D12 (`583:103`), the benchmark (`621:416`), the disregarded Option A (`588:102`).
**Mockups (28 Oct):** app-look mockups of the screens, checked by the owner against the wireframes, are in `docs/superpowers/specs/2026-10-28-creating-a-resbite-mockups/` (open any `M-*.dc.html` in a browser; `Main.dc.html` is CR-B1). The people list has no wireframe: `M-People1.dc.html` is its design.

## Intent

Fermín reviewed the 22 October TestFlight build and found that creating a resbite asks for confirmation before anything is chosen: the date and time come pre-filled from the idea, "Looks good?" reads as a summary, a progress bar promises a sequence that isn't there, there is no end time, missing details look like values ("Place to choose"), the error for a missing detail appears out of view, and on the resbite the host's actions are icons without labels, mixed with chips of the same weight as the information. Stephen asked for an end time (the chat closes 7 days after it, 16 Oct), one link per resbite (12 Oct), "Do this again" after the end and owner-only deletion (16 Oct). On 28 October the owner added repeating resbites ("every Thursday") to this build and decided that admins may cancel.

The redesign is one plan screen. An idea fills what the resbite is about; the host completes **When** and **Where** from that screen, in sheets; Create is always there and says what's missing. The same screen edits the resbite later. The resbite itself becomes a full page in a fixed order, with one labelled row of actions.

**Success**
- Marcos taps "Board game night", sees "Add a date and time" and "Add a place", sets Saturday 19:00 to 22:00 and "My house", taps Create and sees "It's on!" with the card guests will get. He invites four contacts, or taps "Not now" and finds the resbite on top of My resbites.
- He taps Create with no place: the screen scrolls to Where, the row says "Add a place or choose "To be decided"", and a line above Create says what's missing. Nothing is created.
- He opens Edit, moves the start by an hour and taps "Save and notify 6 people". No pop-up; the six are told.
- Ana, a guest, sees the same page without "You're hosting", Invite or Edit: her reply with "Change", and More.

## Owner decisions (28 October 2026)

| # | Decision |
|---|---|
| CR-D1 | Build Option B with the dev brief's rules. **The wireframes set the layout** (structure, order, what is fixed and what scrolls, sheets from the bottom), translated into the app's kit and colours; they are not behaviour-only sketches. Where a brief rule and a wireframe differ, the brief wins. |
| CR-D2 | **Inviting is the contact-invitation flow already on `main`** (direct in-app invitations, personal WhatsApp/Messages links, the open link with host approval), not the brief's single shared link. The brief predates it (its "For later 3" is now built). |
| CR-D3 | **Maybe stays** in this build (UX2 added it to the database, notifications, calendar and the web page). The brief's D12 (Going and Can't go only) is dropped; the owner confirmed Maybe after the builder check, so it is not raised with Stephen. |
| CR-D4 | A **cancellation notice goes to everyone invited** (UX2), not only to people going as the CR-08 note says. |
| CR-D5 | **No drafts.** A resbite either exists or is discarded; closing the plan with changes asks "Discard this resbite?". |
| CR-D6 | **The end time is required** for every new or edited resbite, with duration shortcuts. Resbites created before this build keep their start only until edited. |
| CR-D7 | **No Chat row** until the CH flow is built. The order of the page leaves its place at the end. |
| CR-D8 | **Admins are in.** The owner appoints them from the people list: "Make admin" and "Remove as admin" on a guest who is Going. Admins are listed with an "Admin" label and see "You're an admin" where the owner sees "You're hosting". Admins can do everything the owner can on the resbite, cancelling included (CR-D15), except remove the owner or appoint and remove admins. |
| CR-D9 | **Mute this resbite** is in, per person. |
| CR-D10 | **Where offers recent places and "To be decided"** now. Address search and saved places wait for a places service in a later build. |
| CR-D11 | **No "Report this resbite" row** until the report flow exists. |
| CR-D12 | **Video-call links are refused** in any text field (Google Meet, Zoom, Teams). |
| CR-D13 | **iOS first.** Android back and swipe-to-close are specified so the Android build does the same later. |
| CR-D14 | **A resbite stops accepting changes at its end time**, not at its start as the database does today. Editing, cancelling, inviting, replies, open-link requests and removing guests all work until the end ("we're running late", a late reply), and close after it. |
| CR-D15 | **Admins may cancel the resbite**, as wireframe CR-08 shows (the owner's answer to CR-P5). Guests never can. |
| CR-D16 | **A resbite can repeat** ("every Thursday"). The When sheet gets a Repeats choice and the next occurrence is created by itself; the shape is CR-P22 to CR-P26. |

## Calls made while writing (the owner checks these)

| # | Call |
|---|---|
| CR-P1 | The plan screen also carries **Description** (optional, under Title) and **Categories** (chips, after the note; one or two required, as CE-D6 and the database already demand), so "Start from scratch" can fill what an idea would. The wireframe shows Title, When, Where and Note only because it starts from an idea. The categories are the seven approved ones (Creative, Intellectual, Mindful, Natural, Physical, Community, Uplifting); "Adventure" on wireframe CR-01 is filler. |
| CR-P2 | **Area** (shown to people who haven't answered, GI1) and **Meeting details** (door code, UX3) live at the bottom of the Where sheet, under the place rows. Both are optional. The brief doesn't mention them; they are live features and stay. |
| CR-P3 | **The open event link leaves the resbite page.** Share, Copy link and Turn off move into the Invite screen (`/invitations`) as a section under the contacts. The resbite page keeps only Invite, Edit and More (review D9: every action in one place). |
| CR-P4 | **The people row and list.** The row reads "Going N · Can't go N", with "Maybe N" when there are any, then avatars and first names. For the owner and admins it adds "· N invited" (personal links not answered) and "· N waiting" (open-link requests). Tapping the row opens the **people list as a full page**, grouped Going, Maybe, Can't go, "Invited, not answered yet" (Send again by WhatsApp or Messages, Remove) and "Waiting for you" (Approve, Decline), with Remove on guests and the admin actions for the owner, all behind each row's three-dots sheet. A guest who hasn't answered yet sees counts only (UX2-D6 keeps names for people who answered). |
| CR-P5 | **Superseded by CR-D15.** The call was owner-only cancelling (brief rule 24 reserves the destructive end for the owner); the owner decided admins cancel too, as CR-08 shows. |
| CR-P6 | "**Save and notify N people**": N counts Going and Maybe, the people UX2 already tells about a new time or place. The banner above the form says "N people are going. They will be told about changes to the date, time or place." With N = 0 the button says "Save" and there is no banner. |
| CR-P7 | **Mute** silences that resbite's pushes and its reminders for the person who taps it; it never affects anyone else. The per-resbite reminder mute that UX3 keeps on the device becomes this one setting, stored on the server so the sender can skip the person. The global "all reminders" switch stays in Notifications settings. |
| CR-P8 | **Video-call detection** matches `meet.google.com`, `zoom.us` (any subdomain), `teams.microsoft.com` and `teams.live.com` in Title, Description, Note to guests, place, Area and Meeting details, on Create and on Save. The field shows, in place: "Resbite is for meeting in person. Take out the video-call link." Other links are allowed. |
| CR-P9 | "**To be decided**" is a stored flag on the plan, not the words in the place field, so the resbite page, the web page and notifications can say "Place to be decided" in their own words and Maps is never offered for it. |
| CR-P10 | **Do this again** opens the plan screen pre-filled with title, description, image, categories, place, area and meeting details, with When empty (as "Repeat resbite" did in 2021-L2); there is no draft in between. After the resbite ends it is the main action; before, it stays in More. |
| CR-P11 | **Headers** follow GL 13: tab roots show the tab name; the idea and the resbite are content pages (image to the top of the screen, Back floating over it, the bar turning solid with the name once it scrolls away; screen readers hear the name as the title); New resbite and Edit resbite are tasks (full screen from the bottom over the tab bar, X "Close" top left, title "New resbite" or "Edit resbite", nothing on the right); When, Where, More and the discard question are sheets with a grabber; "It's on!" is a moment with no header. |
| CR-P12 | The "Reminders on" chip goes with the other chips. Reminders stay automatic for the owner, admins and people going or Maybe (UX3), and Mute is the way to stop them for one resbite. |
| CR-P13 | **The idempotent-create journal stays.** Drafts go, but the request record that stops a lost connection creating the same resbite twice is kept, so Create can be retried safely. |
| CR-P14 | **All day** sets the start to 00:00 and the end to 23:59 of the chosen date, and the row reads "Sat 24 Oct · All day". An end may cross midnight; then the row shows the end's date too. |
| CR-P15 | **An admin's own reply.** Admins keep the reply they had when appointed. Their More sheet has a "Change my reply" row that swaps the sheet's content for the Going / Maybe / Can't go control (GL 5: a sheet may change its own content, never open another). A reply of Can't go ends the admin role at once; Maybe keeps it. Only the owner appoints and removes admins; an admin can't remove another admin. |
| CR-P16 | **Invited, not answered yet** holds both kinds: people invited in the app (Remove only; they already have the invitation and its push) and people invited by personal link (Send again, Remove). Send again shows only for links this phone sent, because the code lives on the sender's phone and a resend from another phone would replace it. Both kinds count in "· N invited". |
| CR-P17 | **Notices with admins.** Admins get the notices the owner gets as host (a new request, an answer). A change made by an admin is also told to the owner and the other admins; whoever made the change is never told of it. |
| CR-P18 | "**Save and notify N people**": N is the number of people the database will tell, which today is everyone invited in the app who is Going, Maybe or hasn't answered (not Can't go, not people with no account yet). The banner reads "N people will be told about changes to the date, time or place." The button says "Save" when neither the time nor the place changed, because nothing is sent for a new title, description or categories. A changed note sends the note push as today. |
| CR-P19 | **A guest who hasn't answered** sees the Going · Maybe · Can't go control as the bottom row (the words the app already uses) and no More. Once answered, the row is the reply with Change, and More. |
| CR-P20 | **A resbite ends the same day or the next**: there is one Date row, and an end earlier than the start means the next day. Longer resbites (a weekend away) are not supported in this build; the owner can overrule this. |
| CR-P21 | **After the end the page is read-only.** The brief says only that Do this again replaces Invite and Cancel resbite goes; wireframe CR-06a still shows Edit. Since the database refuses every change after the end (CR-D14), a button that can only fail is wrong: the owner and admins see **Do this again** alone in the bottom row, and a guest sees their reply as text with no Change. More is not shown after the end for anyone (Add to calendar and Mute have nothing left to do). For a resbite created before this build with no end time, the end is its start, as today. |
| CR-P22 | **Repeating resbites roll one occurrence ahead.** A repeating resbite is an ordinary resbite with a repeat rule. When it ends, or is cancelled on its own, the next occurrence is created automatically one or two weeks later at the same local time (the plan's `time_zone`, so the clocks changing don't move it): same title, description, photo, categories, place or "To be decided", area, meeting details and note, the same admins, and everyone invited in the app (CR-P24). Each occurrence is its own resbite with its own replies, people list, note and, later, chat. Nothing is created beyond the next one, so there is no end date and no count: the series runs until it is stopped. The September milestone's F6 note proposed bounded series of up to 12 previewed occurrences; this build takes the rolling model because the owner asked for "every Thursday" with no end, and twelve Thursdays in My resbites at once, each asking for a reply, would bury everything else. The owner can overrule. |
| CR-P23 | **Where it is set.** A **Repeats** control at the bottom of the When sheet, under the duration chips: Doesn't repeat · Every week · Every 2 weeks. Monthly waits for a later build (same date or same weekday is a decision for then). The When row on the plan keeps "Thu 30 Oct · 19:00 to 22:00" and adds a second line "Every week"; the resbite page's When line adds a second line "Every Thursday" ("Every other Thursday" for two weeks), and after that occurrence ends "Every Thursday · the next one is in My resbites"; the It's on! card line ends "· Every week"; the web page says the same. Repeats can be set when creating and changed on Edit. |
| CR-P24 | **Who comes along to the next occurrence**: everyone invited in the app, whatever they answered this time (Can't go this week may go next week), except people the host removed; admins stay admins; a person's Mute carries, because the mute is on the series. People invited by personal link who never joined are not carried: the host sends them a link again from the Invite screen. Replies start empty on each occurrence, so every week asks again, and everyone carried gets the usual invitation push for the new occurrence (words builder's choice, such as "Board game night is on again: Thu 6 Nov"). The owner and admins get no push; the new occurrence appears at the top of My resbites. A guest can't leave a series in this build other than by asking the host to remove them (open for the owner). |
| CR-P25 | **Changing a repeating resbite.** Edit changes this occurrence; the next one is copied from it when it is created, so a change carries forward (a new place from this week on). The next occurrence is dated from this one's date, so moving this Thursday to Friday makes the series Fridays; a one-off move isn't distinguished in this build, and the owner moves the next one back when it appears. "Doesn't repeat" on Edit ends the series after this occurrence; there is no separate Stop repeating row, because the When sheet is the one place for it (rule 5). **Cancel resbite** on a repeating resbite asks "Cancel this resbite for everyone?" over the line "It repeats every Thursday. Everyone invited will be told.", with two red choices, "Cancel just this one" (everyone invited is told, CR-D4, and the next occurrence is created right away) and "Cancel this and stop repeating", plus "Keep resbite". |
| CR-P26 | **Data and machinery for repeats.** `plans.repeat_weeks smallint null check (repeat_weeks in (1, 2))`; `plans.series_id uuid not null` (the first occurrence's id; a resbite that doesn't repeat is its own series); `plans.repeats_from uuid null unique references plans` (the previous occurrence; the unique index makes rolling idempotent under retries). A function `private.roll_repeating_plans()` creates the next occurrence for every plan with a repeat rule, no next yet, whose end has passed or that is cancelled with its rule still set: it copies the plan, its admins and its in-app attendees as pending invitations and queues the invitation notices through the outbox. pg_cron runs it every five minutes; as with the sender's job, the owner creates the job from a script in `supabase/ops/`, because the assistant may not create cron jobs. Mutes are keyed by `series_id`. The web page shows "Every Thursday" when the plan repeats. |

## Goals

- A host completes a resbite from an idea in two taps' worth of decisions (When, Where), and nothing is chosen for them.
- Missing details read as tasks and errors appear where the problem is; Create never looks disabled.
- Every action has a label; information, personal actions and host actions have different weights.
- Creating and editing look and work the same.
- Guests see who is going.

## Non-goals (this build)

- Address search, saved places (CR-D10).
- The chat and its row (CH flow); the report flow (CR-D11); ownership transfer and the full AG flow; groups and circles (PR flow).
- Removing Maybe (CR-D3). Changing how invitations work (CR-D2).
- A new look for My resbites and the cards: the card component is reused as it is, with the end time added to its time line.
- Android build and behaviour checks (CR-D13).
- Monthly repeats, series with an end date or a count, and a guest leaving a series (CR-P22 to CR-P24).

## Anti-goals

- A plan screen that can be submitted with a pre-filled or default date, time or place.
- A disabled Create, or an error shown out of view.
- An action that appears in two places (header and bottom row, page and More).
- Any pop-up that only asks "Are you sure?" where the button can say the consequence instead.
- "Cancel" used as a way out of a screen.

## Constraints

- Expo SDK 57 and the app's kit (`mobile/src/design`): `StepScreen`, `InfoSheet`, `FieldCard`, `Chip`, `Tile`, `Segmented`, `AvatarStack`, `CoverCard`, the icon set already in the app. New components only where the kit can't express the wireframe (the content-page header, the sheet with a grabber, the error summary line).
- Hosted database changes are migrations approved by the owner by file name and sha256, applied as in `supabase/README.md`; never `supabase db push`.
- Notifications go through the existing outbox and the live `deliver-notifications` sender; new kinds reuse its shape.
- Test mode for phone codes stays as it is (CI-D13).
- Copy below is final unless marked "builder's choice". UK spelling in the app ("labelled", "Can't go" with the curly apostrophe the app already uses).

## The flow

```
Create tab (CR-01) ──tap idea──▶ Idea (CR-02) ──Use idea──▶ New resbite (CR-B1)
Create tab ──Start from scratch──────────────────────────▶ New resbite (empty)
New resbite ──Add a date and time──▶ When sheet (CR-B2) ──Done──▶ New resbite
New resbite ──Add a place────────▶ Where sheet (CR-B3) ──Done──▶ New resbite
New resbite ──Create, something missing──▶ Missing information (CR-B1c), stays
New resbite ──Create, complete──▶ It's on! (CR-04) ──Invite people──▶ Invite (/invitations)
                                                  ──Not now──▶ My resbites with the resbite on top (CR-06)
New resbite ──X / swipe down, with changes──▶ Discard this resbite? (CR-B1b)
Resbite (CR-06) ──Edit──▶ Edit resbite (CR-05) ──Save──▶ Resbite
Resbite ──More──▶ CR-08 (owner, admins) · CR-09 (guest)
Resbite, after the end (CR-06a): Do this again replaces Invite, Edit and More (CR-P21)
Repeating resbite ──ends or is cancelled on its own──▶ next occurrence created, people invited again (CR-P22)
```

## Screens

Node ids are the wireframes to build from; implementers pull each one with the Figma tools rather than from this text.

### CR-01 Create (`589:114`)

Tab root, title "Create". Fixed: top bar and tab bar; the content scrolls. Heading "What do you want to do?", a secondary button "Start from scratch", "Or start from an idea", the category chips (All and the seven approved categories) and the idea grid (image, name). The idea search the build already has stays above the chips (builder's choice where exactly). Tapping an idea opens CR-02; "Start from scratch" opens CR-B1 empty.

### CR-02 Idea (`589:170`)

Content page. The image runs to the top; Back floats over it. Name, category chips, description. Fixed bottom button "Use idea" opens CR-B1 with title, description, image and categories filled. **Never the date, time or place.**

### CR-B1 New resbite (`589:198`), CR-B1a complete (`589:354`)

Task screen from the bottom, covering the tab bar. Top bar: X ("Close") left, title "New resbite", nothing right. Fixed bottom button "Create". The body scrolls: image header with "Change photo" under it (the existing cover picker), then rows:

| Row | Empty | Filled |
|---|---|---|
| Title | "Name your resbite" | the name; wraps onto a second line, never cut |
| Description (optional) | "What you'll do together (optional)" | text |
| When (calendar icon) | **Add a date and time** › | "Sat 24 Oct, 19:00 to 22:00" › |
| Where (location icon) | **Add a place** › | "My house" › or "To be decided" › |
| Note to guests (optional) | "Add a note" | text |
| Categories | chips, none selected; "Choose one or two" | one or two chips selected |

Empty When and Where rows are drawn as open items (dashed border in the wireframe; the kit's equivalent is the builder's choice, but they must read as tasks, not values). Tapping When or Where opens its sheet, filled or not. The title and the categories must have a value too: Create treats them like the other missing rows ("Add a name", "Choose one or two categories").

### CR-B2 When sheet (`589:237`)

Sheet with a grabber, heading "When" with the calendar icon. Rows Date, Start time, End time (each opens the native picker), "Quick duration" chips 30 min, 1 h, 2 h, 3 h, All day, the line "The chat closes 7 days after the end time.", and under it **Repeats**: Doesn't repeat · Every week · Every 2 weeks (CR-P23). Fixed "Done". A shortcut sets the end from the start and the end stays editable; a start after the end moves the end to keep the duration. Done saves to the plan; tapping outside, swiping down, the screen-reader dismiss gesture and Android back close without saving. No button at the top. Done is disabled only while the three are not all set (the wireframe shows it enabled; the sheet is the one place a disabled button is allowed, because the row on the plan carries the message).

### CR-B3 Where sheet (`589:301`)

Sheet, heading "Where" with the location icon. The place field (placeholder "A café, a park, your place…"), then "Recent places" as radio rows (name, "Recent"), then the row "To be decided — You can change it later". Under them Area ("Area people see before they reply", optional) and Meeting details (optional), as the current Where step has them. Done is disabled until a place is typed or a row is chosen. Same closing rules as When.

### CR-B1c Missing information (`643:268`)

Create stays enabled. Tapping it with a missing title, categories, date, start, end or place does not create. The screen scrolls so the first incomplete row sits fully under the top bar; each incomplete row shows its message above it, in red, and gets a solid 2 pt border (never colour alone): "Add a name", "Add a date and time", "Add a place or choose "To be decided"", "Choose one or two categories". Above Create: "Two things are missing: a date and time, and a place." / "One thing is missing: a place." (builder composes the list from what's missing). Screen readers announce that line, then focus moves to the first incomplete row. Messages disappear as rows are completed; the line updates. With nothing missing, Create creates.

### CR-B1b Discard (`634:236`)

Action sheet from the bottom when the X, Android back or a swipe down comes after any change: "Discard this resbite?" / "Your resbite isn't created yet. If you close it now, what you entered will be lost." / **Discard** (red text) / **Keep editing** (button, last). With no change the plan closes straight away. Discard is never near Create.

### CR-04 It's on! (`589:390`)

Moment: no header, no way back (the resbite exists). "It's on!", the card (the same `CoverCard` the web invitation header uses: image, name, when with start and end, place), "Now invite the people you want to come." Fixed: primary "Invite people" with the paper-plane icon, text link "Not now". Invite people opens `/invitations?plan=`; after inviting, or on Not now, the app switches to My resbites with the resbite on top (CR-06) and the Create tab resets to CR-01. Android back and swipe down do what Not now does.

### CR-05 Edit resbite (`589:414`)

The plan screen pre-filled, title "Edit resbite", X "Close". Banner "N people are going. They will be told about changes to the date, time or place." when N > 0. Button "Save and notify N people" or "Save". End time and place stay required; a resbite without an end (made before this build) can't be saved until one is set. No confirmation pop-up; the change is notified as UX2 does. X with unsaved changes: "Discard changes?" / "If you close now, your changes will be lost." / Discard / Keep editing.

### CR-06 The resbite, owner and admins (`596:148`); CR-06a after the end (`643:327`)

Content page, Back floating over the image, the name in the bar once scrolled away. Order, top to bottom: name; "You're hosting" (owner) or "You're an admin" (admin) label, not a category chip; When "Sat 24 Oct · 19:00 to 22:00" (with "· Ended" after the end; start only for old resbites; a second line "Every Saturday" when it repeats, CR-P23); Where, tappable, opens Maps (nothing for "To be decided", which reads "Place to be decided"); Note to guests (hidden when empty); the people row (CR-P4); description; category chips. The Chat row's place is reserved (CR-D7). Fixed bottom row, every action with icon and label, icons decorative: **Invite** (primary, paper plane, opens `/invitations`), **Edit** (pencil), **More** (three dots). After the end: **Do this again** (repeat icon) is the only action; Invite, Edit and More go (CR-P21). Between the start and the end everything still works (CR-D14). A cancelled resbite shows its cancelled state as today and no Invite or Edit.

### CR-07 The resbite, guest (`596:208`)

Same page. "Hosted by Ana" under the name. The exact place shows once the guest has answered; before, the area (GI1). The people row shows counts, and names once the guest has answered. Fixed bottom row: the reply ("You're going", "Maybe", "You can't go") with **Change**, which opens the existing Going / Maybe / Can't go control in a sheet; and **More**. A guest whose request is still waiting sees the existing waiting screen, not this page. After the end the reply shows as text, with no Change and no More (CR-P21).

### CR-08 More, owner and admins (`628:222`); CR-09 More, guest (`628:311`)

Sheet with a grabber; tapping outside closes. Rows with a leading 24 pt icon and label; icons decorative. Owner: Add to calendar · Mute this resbite · Do this again · (separated, red icon and text) Cancel resbite. Admin: Add to calendar · Mute this resbite · Do this again · Change my reply (CR-P15) · Cancel resbite (CR-D15). Guest: Add to calendar · Mute this resbite. After the end More is not opened at all (CR-P21). Once muted the row reads "Unmute this resbite" with a plain bell. Cancel resbite asks in place, as today: "Cancel this resbite for everyone?" / "Yes, cancel resbite" / "Keep resbite". On a repeating resbite the choices are "Cancel just this one" and "Cancel this and stop repeating" (CR-P25).

### The people list (new, no wireframe; mockup "People list · three dots" on the canvas)

Full page from the people row, title "People", Back on the left. Groups in order: Going, Maybe, Can't go, Invited, not answered yet (owner and admins only; CR-P16), Waiting for you (owner and admins only). A row is avatar, name and status only: an "Admin" label, or "Invited by WhatsApp", "Invited in the app", "Asked through the link". For the owner and admins each row ends in one three-dots button (44 pt tap area, "Actions for Marta" for screen readers) that opens a sheet for that person: avatar, name and reply at the top, then the actions as rows with icons: **Make admin** or **Remove as admin** (owner only, on Going guests), **Remove from this resbite** (red, last); **Send again** (links this phone sent) and **Remove** for invited people; **Approve** and **Decline** for requests. Nothing else sits on a row. The owner chose this on 28 October over tapping the row and over swipe actions. Guests see the same list without the buttons (counts only until they answer, UX2-D6).

## Rules that cut across screens

1. **Nothing pre-filled.** An idea or "Do this again" fills title, description, image, categories (and place, area, meeting details for Do this again). Date, start and end never come filled.
2. **Required to create or save:** title, one or two categories, date, start, end, place or "To be decided". Optional: description, note, area, meeting details.
3. **Links.** CR-P8. The check runs on Create and Save, and the message shows on the field. Other links are allowed in the note.
4. **Closing.** GL 5 and 13: the X, Android back and a swipe down are the same way out; they ask only when something would be lost.
5. **One entry per action.** Nothing in the header duplicates the bottom row; nothing on the page duplicates More.
6. **Tap areas** of Back and the X are at least 44 × 44 pt.
7. **Chat closes 7 days after the end** (stated on the When sheet; the CH flow enforces it later).
8. **Cards** only where the resbite is one of several or about to be sent: the ideas list, "It's on!", My resbites. Everything else is a full page.
9. **Notifications.** A new time or place: the people going or Maybe (UX2), the button says so (CR-P6). Cancellation: everyone invited (CR-D4). Mute (CR-P7) skips the muted person for that resbite's pushes and reminders. Admin appointment: a push to the person made admin, "Marcos made you an admin of Board game night" (builder's choice of exact words).
10. **Accessibility.** Screen readers announce the screen title on content pages; the missing-information line and the first incomplete row on Create; icon-only never, labels always.
11. **The end is the boundary** (CR-D14). Until the end time: edit, cancel, invite, reply, decide requests, remove guests, appoint admins, post a note. After it: read-only, with Do this again (CR-P21). "· Ended" on the When line and "Do this again" on the My resbites tile mark it. Reminders are unchanged (they run up to the start).
12. **Repeats** (CR-D16). The When sheet's Repeats choice makes the resbite come back by itself (CR-P22); the plan, the resbite page, the It's on! card and the web page say "Every week" or "Every Thursday" (CR-P23); people, admins and mutes carry (CR-P24); edits carry forward, and cancelling asks whether the series goes on (CR-P25).

## Data

- `plans`: `ends_at` required by the create and update functions from this build (the column stays nullable for old rows); a `place_tbd boolean not null default false`; the existing `place_label`, `area`, `note`/`guest_note` and meeting-details columns unchanged.
- **The cut-off moves from the start to the end** (CR-D14): one migration redefines the moment a plan stops accepting changes as `coalesce(ends_at, starts_at)` everywhere the database checks `starts_at <= now()` today ('Plan unavailable': `change_plan_v3`, `require_link_owner`, the respond, request, claim and link functions, about ten in all, best as one helper the others call). The note's window (`set_guest_note`, already the end) is unchanged. The web pages' "happened" state, `canRespond` in `mobile/src/domain/rsvp.ts` and every app rule that reads the start follow. The migration is approved by file name and sha256 at rollout, as the constraints say.
- Admins: a table of plan admins (plan, user, appointed by, at) with policies that let an admin read, update and cancel the plan (CR-D15), invite, decide requests and remove guests, but not touch the owner or the admins table. The owner appoints and removes; a reply of Can't go removes the row (CR-P15). The host-side notices (requests, answers, changes by someone else) go to the owner and the admins (CR-P17).
- Mutes: a table of (series, user) consulted by the sender's eligibility (`notification_recipient_eligible` or its caller) and by the app's reminder sync; keyed by `series_id` so a mute carries along a repeating resbite (CR-P24).
- Repeats: the three `plans` columns, the roll function and its cron job (CR-P26); the create and update functions accept the repeat rule; cancel takes a "stop repeating" flag (CR-P25).
- The web invitation page (`links/`) shows the end time when present and "Place to be decided" for the flag. Builder's choice whether in this build or the next deploy.
- The drafts store, the autosave decisions and the My resbites draft tile are removed; the create journal stays (CR-P13).

## Left to the builder

- How the kit expresses the open-item rows, the error border, the content-page header and the grabber sheet.
- Picker choices for date and time (native iOS pickers).
- The exact words of the admin push and of the people-row suffixes under Larger Text.
- Whether the people list reuses the Guests sheet's row component or a new list.
- Test coverage: the domain rules (missing-information composition, link detection, All day, end before start, people-row text) and the roll function (no duplicate under a retry, same local time across the clock change, nothing after "Doesn't repeat") as unit tests; the flows in the existing browser scripts (`verify-planning.mjs` must drop its draft steps).
- Updating `knowledge-base/08-decisions.md` with CR-D1–D16 and CR-P1–P26, and `docs/implementation-status.md` at rollout.

## Open for the owner (not blocking the plan)

- Raise with Stephen: the open link's new home (CR-P3) and resbites longer than a day (CR-P20).
- Repeats, for a later build: monthly repeats, an end date for a series, and a way for a guest to leave a series without asking the host (CR-P23, CR-P24).
- The TERMS and PRIVACY pages still missing on resbite.com (unchanged from the contact-invitations rollout).
