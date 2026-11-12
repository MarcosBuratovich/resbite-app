# Decision log

**Current development target:** [complete private beta](13-expanded-beta-scope.md), selected 23 September 2026. Read the dated additions at the end for later decisions that supersede the original first-test limits.

| ID | Date | Decision | Authority | Consequence |
|---|---|---|---|---|
| D01 | 2026-09-17 | Limit the foundation to supplied information; do not invent features | Owner request | Every feature must have evidence and a scope status |
| D02 | 2026-09-17 | More recent information wins when sources conflict | Owner reply | Record content/version dates; do not use import copy times |
| D03 | 2026-09-17 | MVP first; premium and marketplace separate | Owner reply | Later product capabilities remain visible but excluded from first release |

## Owner clarifications after the audit

| ID | Date | Decision / confirmed fact | Consequence |
|---|---|---|---|
| D04 | 2026-09-17 | The agency created the idea/designs, but the app was never implemented | Start from the supplied design evidence; do not seek an assumed existing application repository |
| D05 | 2026-09-17 | Immediate objective is a product the owner's boss can view and test; available time is limited | Define a focused demonstration before public-launch requirements; level of real functionality remains a selectable decision |
| D06 | 2026-09-17 | No need to launch with 100 activities or multiple registration methods | Smaller catalogue and at most one registration approach; exact count/provider not selected |
| D07 | 2026-09-17 | There are not illustrations for 100 activities; consider future creation through image generation or a plugin | Plan missing illustration production separately; no in-app image-generation feature or plugin purchase/install is authorized |
| D08 | 2026-09-17 | Present selectable options; some answers are not known | Offer recommendations and a decide-later choice; do not record recommendations as accepted decisions |

## Selected first-build choices

| ID | Date | Owner selection | Consequence |
|---|---|---|---|
| D09 | 2026-09-17 | A mobile app with phone permissions, not browser-based | Mobile installation/testing required; later resolved to iPhone and the three permission categories in D12–D14 |
| D10 | 2026-09-17 | Google as the only sign-in option | Do not implement phone verification or Apple sign-in in the first build; technical setup still needed |
| D11 | 2026-09-17 | Start with 8–12 documented activities that already have suitable artwork; generation for gaps later | Select existing activity/artwork pairs; no 100-item requirement or pre-demo illustration-generation dependency |

The earlier browser/demo-profile recommendations were not selected. The subsequent owner selection is real invitations and RSVP between testers (D13).

| ID | Date | Owner selection | Consequence |
|---|---|---|---|
| D12 | 2026-09-17 | iPhone | First test target is iPhone, not browser or Android |
| D13 | 2026-09-17 | Real invitations and RSVP between testers | Shared plan/attendee state must work; sample-only RSVP cannot satisfy the test |
| D14 | 2026-09-17 | Location, notifications and contact import | Include these capabilities; permission timing, decline paths and notification triggers still need definition; never automatically invite imported contacts |
| D15 | 2026-09-17 | Require Google sign-in for all testers, including invitees | No name-only guest RSVP in the first build; attendees use the same account model as organizers |

## Audit interpretations, not owner decisions

- A01: V3's “MTV” child-account note likely means MVP. Treat child accounts as deferred and preserve the exact wording.
- A02: The registration “Not for MVP” note appears near profile-photo screens. Provisionally exclude mandatory photo onboarding; exact coverage remains Q12.
- A03: The L “Not a priority” note appears near feedback. Treat post-event extras as reduced priority without deleting completed-activity data needed for wellness.
- A04: A May 2026 export containing placeholder copy does not establish new authored scope for its unfinished sections.
- A05: Newer no-ads/no-virtual-rewards principles override old featured-placement monetization and badge/challenge rewards.

Google is the owner-selected sign-in provider. Technical stack, invitation channel, analytics supplier, launch date and scoring formula remain unselected. Guest RSVP is excluded from the first build by D15.

## D16 — Owner answers to Q01–Q17

The owner supplied the numbered selections below. Q01 adds “manual entry” and Q02 says “same as before.” The meaning of manual entry is pending clarification; do not assume a new authentication method or erase the existing Google selection. All other selections are recorded as decisions.

| Question | Selection | Recorded meaning |
|---|---|---|
| Q01 | A + manual entry | Accounts required; manual-entry meaning pending clarification. |
| Q02 | Same as before | Retain previous Google selection; reconcile manual-entry request before finalizing registration. |
| Q03 | A | Manually share working invitation links; notify only about invitations, RSVP and plan changes. |
| Q04 | A | Search and categories; defer other filters, similar activities and suggestion form. |
| Q05 | B | Contact import and reusable groups; special Household and QR not selected. |
| Q06 | A | Clearly labelled sample wellness overview of activity time and categories. |
| Q07 | A | Clearly labelled sample conversation after RSVP; live messaging deferred. |
| Q08 | A | Owner cancels if unable to attend; no ownership transfer. |
| Q09 | A | Defer attendance caps and waiting lists. |
| Q10 | A | iPhone, English, small invited tester group. |
| Q11 | A | 8–12 documented activities with existing artwork; generate gaps later. |
| Q12 | B | Optional profile photo; no mandatory photo step; post-event extras deferred. |
| Q13 | A | Define minimum data, visibility, contact handling, deletion and retention before real-tester use. These rules are still to be written. |
| Q14 | A | Confirmed: no existing app implementation. |
| Q15 | C | Review brand inconsistencies before visual work; no final visual source of truth selected yet. |
| Q16 | A | Proceed with readable newer evidence and retain audit limitations. |
| Q17 | A | Boss plus another tester discover an activity, create a plan and complete a real invite/RSVP loop; set date after scope. No deadline set. |

## D17 — Manual registration clarified

The owner clarified: “mail and password with mail confirmation.” Current first-build access is **Google sign-in OR email/password registration with email confirmation**, for both organizers and invitees. Accounts remain required; no guest RSVP. This supersedes the Google-only restriction in D10/D15 and resolves the ambiguity recorded in D16/Q01/Q02. Phone verification and Apple sign-in are not selected.

Email confirmation applies to email/password registration. Confirmation delivery details and password-recovery behaviour remain implementation details to define; this answer does not select a provider, link-versus-code format or expiry policy. Older phone-verification screens are reference material, not authorization to add phone authentication.

## D18 — Development planning prerequisites

The owner confirmed that **a Mac and Apple Developer membership are available**, and **there is no date** for the first test. This supports milestone-based planning. Credentials, target device OS, signing configuration and backend/link services have not yet been configured or validated.

The [development plan](../docs/superpowers/plans/2026-09-17-resbite-first-test.md) proposes SwiftUI/Firebase and registered-device installation, with detailed invitation, group and retention rules in its [specification](../docs/superpowers/specs/2026-09-17-resbite-first-test.md). These are planning recommendations, not additional owner decisions or a claim of completed implementation. The plan records the TestFlight/sign-in compatibility checkpoint without adding another authentication provider.

## D19 — Motion is required in the first test

The owner explicitly requires microanimations, splash screens, loading and a dynamic interface. Add launch transitions, responsive controls, navigation/state transitions and loading/success/error feedback throughout the selected flows. See [motion specification](12-motion-and-interface-states.md). Swift/SwiftUI for the app and TypeScript for the proposed Firebase backend remain the planning recommendation; this decision does not authorize a new animation plugin or additional product features.

## D20 — Future Android and Supabase

The owner explicitly states that an Android app/APK is planned for the future and instructs **use Supabase, not Firebase**. Supabase replaces the earlier backend recommendation. React Native + Expo + TypeScript is now the recommended implementation approach, replacing SwiftUI as the primary app approach in the plan. iPhone remains the first test target; Android is a later build/QA milestone, not part of the initial delivery acceptance.

Prior SwiftUI/Firebase references in this chronological log describe superseded proposals, not the current plan. Selected product features, both sign-in methods and motion requirements remain unchanged. No Supabase project or external service was created during this planning update.

## Implementation setup decisions — 17 September 2026

- Owner chose **Good add Ventures** for the Resbite Supabase project.
- First testers are primarily **UK / Europe**; project region selected: London (`eu-west-2`).
- Owner chose **leave tester access for later**. No tester email addresses have been assumed or added.
- These setup choices do not expand the MVP scope. See [implementation status](../docs/implementation-status.md) for completed work and outstanding acceptance checks.

## Registration expansion — 18 September 2026

Owner requested the complete registration and information/onboarding screens, then explicitly selected additional date of birth, phone number, city and interests. This supersedes the earlier minimum-fields recommendation for the client registration flow. Implementation treats these additional fields as optional pending a specific required-field decision; display name, email and password are required for email registration. Optional photo remains after confirmation. Historical S0671/S0672 text supports the introductory sequence and name/birth/phone/location/photo concepts; interests and city-level collection follow the current owner request. Legacy SMS/phone-call verification, precise home/work addresses and child-account behavior are not reinstated. Tester access remains closed.

## Owner-only access — 23 September 2026

The owner explicitly approved the single account recorded in the private tester roster. Broader access remains closed; this supersedes historical empty-roster statements. See implementation status for the verified hosted change. No additional account is authorized by the expanded-beta planning request.

## D21 — Complete private beta and expanded feature set

On 23 September 2026 the owner requested a complete development plan and a much more complete MVP, then selected **Complete private beta**. Asked to prioritize live event chat, real wellness/history, saved activities, better planning/calendar, time polls, event photos, recurring plans and richer groups, the owner answered **all of them**. Those capabilities enter the new beta target. This supersedes sample-only chat/wellness and the relevant earlier deferrals. It does not select every archived feature, payments, subscriptions or marketplace. Scope mapping: [expanded beta](13-expanded-beta-scope.md).

## D22 — iPhone first, Android immediately afterward

The owner selected **iPhone first, Android next** for the expanded MVP. Deliver a complete private iPhone beta, then a distinct Android build/integration/acceptance milestone using the shared codebase. No calendar deadline or public App Store launch was selected.

## D23 — Shared groups

The owner selected shared groups that members can join and leave, with a group page and upcoming plans. Event conversations remain attached to individual plans. This expands the earlier device-local private-list scope. It does not authorize uploading existing address books/lists or silently granting group membership. Detailed membership, visibility, ownership and exit rules are proposals in the development plan.

## D24 — Self-confirmed wellness inputs

The owner selected each person's confirmation of attendance and duration, followed by private time/category summaries. Merely scheduling or accepting a plan must not count as completed participation. Category allocation, period boundaries and retention still need the proposed implementation rules finalized; no clinical, relationship or screen-time score was selected.

The [MVP 2 development plan](../docs/milestones/2026-09-23-expanded-private-beta.md) records B0–B8, dependencies, acceptance and outstanding defaults. These decisions authorize the feature direction; this turn produced planning/documentation, not live feature implementation or wider tester access.

## Custom events — 7 October 2026

Owner decisions from the custom-events design session ([spec](../docs/superpowers/specs/2026-10-07-custom-events-design.md)):

| # | Decision |
| --- | --- |
| CE-D1 | Custom events are the primary creation flow; catalogue ideas are optional templates. |
| CE-D2 | An event has a required title, date/time and place, plus a description, an uploaded cover photo (CE2) and categories. |
| CE-D3 | Choosing an idea is an editable template that remembers which idea it came from. |
| CE-D4 | Discover becomes the Create tab; My resbites gains "New resbite". |
| CE-D5 | Categories are the seven wellness categories: Creative, Intellectual, Mindful, Natural, Physical, Community, Uplifting. The wellness formula remains a B5 decision. |
| CE-D6 | Each event and idea has one or two categories. |
| CE-D7 | Approved category mapping for the 11 published ideas (see `mobile/content/activity-categories.json`). |
| CE-D8 | CE comes before the remaining B0 work and B1, in two parts: CE1 events, CE2 cover photo. |

## UX refresh — 7 October 2026

Owner decisions from the UX refresh design session ([spec](../docs/superpowers/specs/2026-10-07-ux-refresh-design.md)); UX1 shipped and was accepted on 14 October 2026:

| # | Decision |
| --- | --- |
| UX-D1 | Visual direction "Cover cards", in the style of Apple Invites: each resbite is a large picture card with its details on a solid panel below the picture (never text over a photo). A single floating + creates. |
| UX-D2 | Creation is step cards, one question per screen: What, When, Where, Vibe, Review, then Invite. |
| UX-D3 | Starting from an idea pre-fills the steps and opens on the Review card. Editing a saved resbite also opens on Review. |
| UX-D4 | The event-app benchmark's recommendations are folded into this work. |
| UX-P1 | Scope: event screens first (UX1). Profile, settings and auth adopt the new components later (UX4). |
| UX-P2 | Keep the four tabs (Create, My resbites, Wellness, Profile) with short labels; the tab bar stays native. |
| UX-P3 | Add Maybe to RSVP, and show the stored `withdrawn` state as "Can't make it now" (UX2, before B1 testers). |
| UX-P4 | Narrow notifications: only a change of time or place notifies, and only accepted, Maybe and not-yet-answered invitees; cancellation notifies everyone; text says what happened and never shows the place or note on the lock screen (UX2). |
| UX-P5 | Guest list after you answer: an invitee sees who else is coming only after responding; the organizer always sees everyone; enforced on the server (UX2). |
| UX-P6 | "Recent places" are the account's last five places, kept on the device only and cleared at sign-out. |

Account deletion split (owner, 7 October 2026: "Split deletion out"): deletion is its own track and is required before any wider beta. B1 may start with one explicitly approved tester. UX2's database migrations each need explicit owner approval and must land before the second tester joins.

## UX2 — 14 October 2026

Owner decisions from the UX2 design session ([spec](../docs/superpowers/specs/2026-10-14-ux2-design.md), [plan](../docs/superpowers/plans/2026-10-14-ux2.md)). UX2 covers the items the UX refresh deferred before B1 testers: Maybe, the guest list after answering, narrower notifications and the cover description.

| # | Decision |
| --- | --- |
| UX2-D1 | Saving an edit returns to the event page with a short "Changes saved" note, shown once. |
| UX2-D2 | Organizer actions on the event page stay icon-only. |
| UX2-D3 | The My resbites heading says "My resbites". The tabs stay Upcoming and Past. |
| UX2-D4 | What a notification may show on a locked iPhone: the event title, what happened, and who did it, for example "Sam is going." under the heading "Picnic in the park". It never shows the place, the note, the description or the cover description. |
| UX2-D5 | Before answering, an invitee sees only the organizer: no names, photos or counts of other guests. |
| UX2-D6 | The invitee side is accepted with coworkers on TestFlight (owner: "I will push this app to testflight so we can test with my coworkers"). This replaces the beta plan’s registered-device installs for B1 (distribution row of the [expanded private beta plan](../docs/milestones/2026-09-23-expanded-private-beta.md)). |
| UX2-D7 | One coworker first. The rest join after the account deletion track. This keeps the 7 October rule ("Split deletion out"). |

**Planning amendment (14 October 2026).**
- The cover description has its own small save, `set_plan_cover_description`, instead of riding on the photo-change function. Threading it through the photo machinery would also have changed the live profile-photo code. The behaviour people see is unchanged.
- The database clears the description whenever the photo changes (a new photo, a removed photo, the old app, account deletion), so no app code is involved.
- Preview mode keeps a cover description in memory, as it does the photo. Preview only has the organizer’s view, so the invitee cases (a Maybe answer, an unanswered invitation with the guest list hidden) are covered by the browser checks’ stubbed server data.
- The migrations are fixed as `20261014120000_ux2_rules.sql` (hosted-compatible) and `20261014130000_ux2_notification_wording.sql` (local-only, ships with the notification sender).

Each UX2 database migration needs the owner’s explicit approval, and the rules migration must land before the second tester joins. Notification sending stays switched off.

## UX4 — 15 October 2026

Owner decisions from the UX4 design session ([spec](../docs/superpowers/specs/2026-10-15-ux4-design.md), [plan](../docs/superpowers/plans/2026-10-15-ux4.md)). UX4 brings the 13 screens outside the event flow (sign-in, first run, Profile and its sub-screens) to the same minimal, widget-like standard as UX1, without changing how anything works. Status: accepted on the owner’s iPhone on 15 October ([UX4 QA](../qa/ux4-2026-10-15/README.md)).

| # | Decision |
| --- | --- |
| UX4-D1 | One piece of work for all 13 screens: one spec, one plan, one iPhone check. The owner chose this over splitting into two phases. |
| UX4-D2 | Profile is "B · Grouped rows": a centred photo and name, one card of icon rows (People & groups, Account details, Notifications, Data & privacy), and Sign out in its own card. The owner’s single browser click was on A; the typed answer "b" is taken as the choice. |
| UX4-D3 | Sign-in and first run are "A · Landing, then a short introduction": a landing page, three trimmed introduction slides, sign-in as field cards, and sign-up as step cards. |
| UX4-D4 | Wellness, Data & privacy, Notifications and Delete account follow the mockup ("looks right"). The full deletion warning moves into a "What happens" sheet while a short warning card stays visible. |
| UX4-D5 | The Wellness sample rows use approved categories: "Adventure" becomes Physical and "Meals & Drinks" becomes Community. The minutes are unchanged (60, 60, 30). The data stays labelled as sample. |

**Decisions the plan makes (P1 to P14).**

| # | Decision |
| --- | --- |
| P1 | Chips show short text and keep today’s action wording as their accessibility label (for example "Check again" is labelled "Check account access"; "Skip" is labelled "Skip introduction"; "Sample data" is labelled "Sample wellness data"; "Clear date" is labelled "Clear date of birth"). |
| P2 | **Spec amendment, confirmed by the owner with the plan:** "Reload saved details" on Account details is always a quiet (not red) row. The spec showed it only when loading failed, but Account details has no load-failure state, and Reload is the one way to discard unsaved edits and fetch the saved values. |
| P3 | Notifications: the status card’s title is "Not active yet". The delivery label and detail move unchanged into an ⓘ sheet, "About notifications". "Open My resbites" stays as a chip because that explanation tells people to open it. |
| P4 | Sign-up step buttons say "Next", as the creation steps do. The last step says "Create account". |
| P5 | The private-beta line ("Private Resbite test · access is opened by invitation.") moves behind an ⓘ labelled "About access" in the sign-in screen’s top bar. |
| P6 | The Google chip appears on Sign in and on sign-up’s "Your account" step (the spec). It was on Sign in only. Choosing it from sign-up leaves the typed sign-up details behind, as Google sign-in from Sign in does today; Account details’ setup ("About you") then offers them. |
| P7 | Sign-up Skip (on "About you") empties phone, city and interests and moves to "Your account". The name and birth date stay. |
| P8 | The account access check keeps its guidance on the card, word for word, with no ⓘ. |
| P9 | Delete account: the Back label is "Privacy". The "What happens" sheet holds the three warning paragraphs and the former Privacy "Account deletion" paragraph, word for word. The two numbered card titles are not headings. The red button is a new `destructive` variant of `Button`. |
| P10 | On iPhone the birth date picker opens in an `InfoSheet` (same picker, "Use this date" and "Cancel"). The web keeps the typed field. |
| P11 | Reset and the email-only Confirm show "You can request another email in Ns." as the screen’s status line. The sign-up "Your account" line keeps its full text. |
| P12 | Removed text that is not protected: the eyebrows (for example "YOUR RESBITE ACCOUNT", "YOUR PREFERENCES", "DEVICE PERMISSION"); "or with your email"; the landing note "A little time. A real connection."; the introduction’s eyebrows, descriptions and detail cards; the Profile "Browse ideas" row (the spec); and the second Wellness heading "A little of everything.". |
| P13 | Profile’s `save()` returns `true` once the name is saved, and the name sheet closes on `true`. Nothing else about saving changes. |
| P14 | "Check your inbox" (an email on file) and the email-link page are status cards. Reset and the email-only "Confirm your email" are forms: an email field card and one button, with their notice in the existing tinted card. |

**Decided during the build (15 October 2026), for the owner’s review.**
1. On "Check your inbox" the resend chip keeps the label "Resend confirmation email" and, while the cooldown runs, carries the hint "You can request another email in Ns." (the visible text says "Resend in Ns"), so VoiceOver reads the countdown.
2. "Create account" stays on Reset password, next to "Back to sign in". The old screen offered it there; the plan had dropped it.
3. Every field card has a visible prompt: "Email address", "Password" (sign-in), "New password" (email-link page), "Current password" and "Verification code" (Delete account). Labels are unchanged.
4. Shorter sign-up placeholders so they fit under Larger Text: "Your name" (was "What should we call you?") and "Your city" (was "Your city or town"). The phone placeholder is unchanged.
5. Header rows wrap under Larger Text on Wellness, Notifications, Privacy and Account details: the ⓘ drops below the heading instead of being pushed off screen.
6. The Wellness ring grows with its content under Larger Text (148 pt minimum), so "2h 30m" stays inside it.
7. Large pill buttons centre wrapped text.
8. Deferred to the owner’s iPhone check: the tab bar’s labels truncate under the largest forced text sizes in the browser proxy (the tab bar is unchanged by UX4), and single-line field placeholders can still truncate at the very largest sizes.
9. On "Check your inbox" the chips (I’ve confirmed, Resend, Use a different email) sit below the notice, so signing in with an unconfirmed account reads "…or request another below." above them.
10. Profile shows the signed-in email again, as a muted line under the name (the old screen showed it).
11. The introduction’s "I have an account" keeps its old target (`/auth` with no mode), so a saved confirmation or recovery request restores its screen. The landing’s link keeps `mode: "login"`.
12. P1 change: "Check again" (account access and Notifications) and "Email help" are labelled by their visible text, with hints, so iOS Voice Control "Tap Check again" works.

## UX3 — 15 October 2026

Owner decisions from the UX3 design session ([spec](../docs/superpowers/specs/2026-10-15-ux3-design.md), [plan](../docs/superpowers/plans/2026-10-15-ux3.md)). UX3 covers invite links on their own domain, an optional end time, private Meeting details, the Note to guests, Add to calendar and reminders. Status: built on the `ux3` branch; not on the hosted project, not deployed, not on TestFlight.

| # | Decision |
| --- | --- |
| UX3-D1 | One piece of work: links, event details, calendar and reminders share one spec, one plan, one migration and one TestFlight build. The owner chose this over the recommended split into three. |
| UX3-D2 | Links live on their own subdomain, `link.resbite.com`. It is a tiny static site kept in this repo and deployed as its own Vercel project. The owner adds one DNS record in Cloudflare. The marketing site (`www.resbite.com`) is untouched. Changed from `go.resbite.com` to `link.resbite.com` by the owner on 15 October 2026, before anything was deployed: a plain name that can carry other links later. |
| UX3-D3 | Approach "phone first": reminders are scheduled on each person’s phone; "Add to calendar" uses iPhone’s own form; notes live in the database behind access rules; anything meant for a server notification is only recorded. |
| UX3-D4 | Two reminders, 1 day and 1 hour before the start. The owner chose "Both" over a single reminder. |
| UX3-D5 | Two notes. Today’s "A note for everyone" becomes private Meeting details (a door code, a meeting spot). A new Note to guests is a short announcement pinned for everyone invited. |
| UX3-D6 | "Accepted" means Going or Maybe: these guests, and the organizer, see Meeting details and get reminders. |
| UX3-D7 | "Can’t go" replaces "Can’t make it" on the answer button, the status chip, the guest-list group and the stored notification text. "Can’t make it now" becomes "Can’t go now". |
| UX3-D8 | Reminders don’t depend on the calendar. They come from Resbite whether or not the event was added to a calendar. The calendar entry Resbite fills in carries no alert, so nobody gets doubled reminders. |

**Decisions the plan makes (P1 to P12).**

| # | Decision |
| --- | --- |
| P1 | **Spec amendment, confirmed by the owner with the plan (15 October):** Add to calendar asks for no permission at all. It uses `createEventInCalendarAsync` from `expo-calendar/legacy`, which opens iPhone’s own form, so Resbite never gets calendar access, not even write-only (the spec said write-only). The build still declares honest calendar and reminders purpose strings, because Apple rejects builds whose libraries reference those APIs without them (build 3’s motion rejection). |
| P2 | **Spec amendment, confirmed by the owner with the plan:** one hosted migration plus one local-only migration. The unreleased notification sender re-checks each Note to guests notice at send time, like change notices. That check lives in a local-only function, so it gets its own local-only migration, as UX2 did. Nothing local-only goes live with UX3. |
| P3 | **Spec amendment, confirmed by the owner with the plan:** `plans.has_meeting_details` lets every invitee know Meeting details exist, so the locked line appears only when there is something to unlock. The text itself stays private. |
| P4 | The database does the deletion clean-up. Account deletion’s existing redaction trigger (hosted) now also removes Meeting details and the Note to guests, so the local-only deletion code needs no change. |
| P5 | Old save functions delegate. `create_plan_v2` and `change_plan_v2` keep their signatures and call the v3 functions; v2 edits keep an existing end’s length. The first-generation `create_plan` (unused since CE1) now refuses a non-empty note, because the old note column must stay empty. |
| P6 | Note to guests notification text: "Sam posted a note to guests." It never includes the note itself. |
| P7 | Reminders are capped at the 60 soonest, under iOS’s limit of 64 pending notifications. |
| P8 | The link site serves the Resbite mark as the preview image and redirects `/` to `www.resbite.com`. Its page reads "You’re invited" with one line, a button and a private-testing note. |
| P9 | Reminders play the default sound when they arrive in the background, because a reminder nobody hears isn’t much of one. Inside the app they show as a banner with no sound. |
| P10 | Add to calendar needs iOS 17 or later. On iOS 17+, iPhone’s form opens with no permission check. On older iOS the library would demand calendar access, so Resbite shows "We couldn’t open your calendar. Add to calendar needs iOS 17 or later." instead of asking. |
| P11 | Reminder times are stored with each reminder (`data.at`). Expo 57 on iOS reports a date trigger back as a time interval, so without the stored time every sync would cancel and reschedule everything. |
| P12 | Signing out also clears reminders already shown in Notification Center, not only scheduled ones. |

**Decided during the build (15 October 2026), for the owner’s review.**
1. The Note to guests is the organizer’s alone, even on an ownerless event. `private.set_guest_note` checks `owner_id is distinct from` the caller. The plan’s block used `<>`, which let any attendee post on an event whose organizer had deleted their account while it was under way. A test in `supabase/tests/ux3.sql` (block 3) covers it.
2. The 280-character limit counts characters as the database does (code points, `char_length`), in `guestNoteError`, so an emoji counts once in both places.
3. The calendar form carries the place name, as the spec says. The plan’s line that listed the place among things never in calendar entries was a wording error. Only Meeting details, the Note to guests text and links never reach calendars. Reminders carry the name and time only.
4. The first-generation `create_plan` refuses a non-empty note (P5), kept as planned.
5. Older builds can replace Meeting details but can no longer remove them: an empty note from `change_plan_v2` keeps the existing text, so an ordinary edit on an old build never deletes them. (Their editor loads the note column, which is now always empty, and sends it back with every edit.) A test in `supabase/tests/ux3.sql` (block 1) covers it.
6. The owner checks in `create_plan_v3`’s retry branch and in `change_plan_v3` use `is distinct from`, like `set_guest_note`, so nobody can edit an ownerless event or have its creation identifier acknowledged (block 3 covers both).

Each UX3 database migration needs the owner’s explicit approval. The hosted migration goes live together with the new TestFlight build, because builds older than UX3 read the emptied note column. Notification sending stays switched off.

## GI1 — 21 October 2026

Owner decisions from the GI1 design session ([spec](../docs/superpowers/specs/2026-10-21-gi1-event-links-design.md), [plan](../docs/superpowers/plans/2026-10-21-gi1.md)). GI1 gives each event one link, `link.resbite.com/r/<code>`, and a web page that shows the basics and one RSVP button. Stephen’s reason, from the research board: being invited is the best moment to turn a guest into a user. GI2 builds the guest’s account and reply; GI3 builds capacity and host approval. Status: built on the `gi1` branch, on top of `ux3`; not on the hosted project, not deployed, not on TestFlight.

| # | Decision |
| --- | --- |
| GI-D1 | **The invite link grants access.** An account created from a valid link is approved for the beta automatically; the tester roster stays for everyone else. Built in GI2; GI1 keeps today’s roster gate. (21 October 2026) |
| GI-D2 | **The page and the preview show the basics, as designed:** the host’s name, title, time, area, count and image. The exact place, Meeting details, the Note to guests and guests’ names stay behind an account and a reply. This reverses UX3-D2’s generic preview, deliberately. (21 October 2026) |
| GI-D3 | **Three parts:** GI1, GI2 (guest account and reply) and GI3 (capacity and host approval). Not now: the group chat, replying on a computer, change notifications (B1), inviting from contacts. (21 October 2026) |
| GI-D4 | **The Invitations screen is replaced** by the event’s link: Share, Copy link, Turn off this link. Per-person links go. Removing a guest moves to the guest list. (21 October 2026) |
| GI-D5 | **An optional "Area" field** on the Where step, shown before people reply. The existing place is the exact one, shown after. (21 October 2026) |
| GI-D6 | **The image is the cover photo, else the activity illustration, else the Resbite mark.** The cover photo becomes visible to anyone with the link. Video is out. (21 October 2026) |
| GI-D7 | **The page is rendered by a server function on the existing Vercel project** (`link.resbite.com`), reading one public database function. Not an Edge Function, and not a static page with a browser-side fetch, because the preview needs server-rendered tags. (21 October 2026) |

**Design proposals the owner accepted with the sections (21 October 2026).**
1. The count shows Going only ("6 going"), or "Be one of the first" when nobody has replied.
2. The "why join" box promises only what the app does today.
3. No analytics in GI1.

**Decisions the plan makes (P1 to P12).**

| # | Decision |
| --- | --- |
| P1 | **Spec amendment, confirmed by the owner with the plan (21 October):** the organizer opening their own link lands on the event. The spec mirrored `claim_invite` (22023 for the organizer). A host will tap their own link in the chat they just posted it in, and an error there is wrong. `claim_plan_link` returns the plan id for the organizer, adds nothing and notifies nobody. |
| P2 | **Spec amendment, confirmed by the owner with the plan:** `public.invitation_page` is a definer wrapper. The spec’s pattern is an invoker wrapper over a definer body, but `anon` has no usage on the `private` schema, so the wrapper for the one anonymous function is a definer too. It returns only what the private body returns. |
| P3 | The page server fails closed. A database error or timeout renders the "no longer active" page with the generic preview. Nothing is cached, so the next request tries again. |
| P4 | The image route streams the cover, through a signed URL valid for minutes and made with the Vercel-only secret, rather than redirecting. The preview address stays stable and the signed URL never leaves the server. |
| P5 | The RSVP sheet opens without JavaScript (a `:target` sheet). The page’s only script shows "If Resbite doesn’t open, install it first." after "I have Resbite: open the app", when the page is still visible 1.5 seconds later. |
| P6 | "Get the app" points at the TestFlight invitation link (`APP_STORE_URL`) until the app is public. The smart app banner is off (`APP_STORE_ID` empty) until then, because Safari only shows it for App Store apps. |
| P7 | Illustrations ship with the site. The generator copies `mobile/assets/activities/*.png` into the deployed folder, so the image route serves them from disk with no database or storage call. |
| P8 | Removing a guest revokes their per-person links too, so a link shared before GI1 can’t bring them straight back. The event link can, by design. |
| P9 | Old links and the old page stay. `/invite#token=` and `claim_invite` keep working for links already shared. Only the organizer screen stops making them. |
| P10 | **Confirmed by the owner with the plan (21 October):** "Turn off this link" also turns off the event’s unclaimed per-person links (shared before GI1). The per-person Revoke is gone, so the host would otherwise have no way to stop one. Claimed ones belong to guests, whom Remove handles (P8). The ⓘ sheet says so. |
| P11 | **Confirmed by the owner with the plan (21 October):** People is no longer an entry point to Invite people. Its only link was "Review invitations", which belonged to the per-person flow. The two entry points that matter (after creating an event, and "Invite someone" on the event page) stay. The spec listed People among the entry points. |
| P12 | **Confirmed by the owner with the plan (21 October):** the share text’s date is in the phone’s time zone, like every card in the app. The web page uses the event’s time zone. For a host sharing their own event the two agree. |

**Decided during the build (21 October 2026), for the owner’s review.**
1. The page’s image route falls back to the Resbite mark on any signing, fetch or read error, and allows only the cover’s content types (image/jpeg, image/png, image/webp). Image responses carry a `default-src 'none'` content security policy.
2. The generated `vercel.json` bundles the mark and the illustrations into the image function (`functions.api/image.mjs.includeFiles`), so the function finds them on Vercel.
3. The "happened" page’s "Plan your own with Resbite." links to the app.
4. An end on another day is written as the app does it ("Fri 23 Oct, 22:00 – Sat 24 02:00").
5. There is no smart app banner when there is no code.
6. The inactive page adds "Ask whoever sent it for a new link."
7. The capture script asserts that the Area step has no sideways overflow, and that the Invite people card shows the area and never the place.

From the final review’s fixes (21 October 2026):

8. The organizer and anyone already on the event get the event back from any of its links: an old or turned-off one, and after the start or a cancellation. Everyone else is refused when the link is turned off (checked again under the event’s lock, so a link turned off at the same moment can’t let them in), or the event is cancelled or has started.
9. A link refused for good (turned off, started, cancelled, malformed, or the organizer’s own per-person link) is no longer kept on the phone, so the next start opens the app as usual; the error still shows and offers "Go to My resbites". Only a lost connection or a timeout keeps the link for a retry. A per-person link opened by its own organizer says "You organize this resbite. Open it from My resbites." (new copy).
10. The exact place hides until a reply. An invitee who hasn’t answered sees the area (if any) and "Exact address after you reply" (only while they can still answer), with no Open in Maps; their My resbites card (and its VoiceOver label) shows the area or no place; Going, Maybe and Can’t go all show the place, as before. The Note to guests stays visible to everyone on the event, which narrows GI-D2’s list: on the event page the exact place, Meeting details and guests’ names wait for a reply. The database still sends the place to everyone on the event; this is the app’s display.
11. Removing a guest is not a ban, and the app says so: the question reads "Remove <name> from this resbite? They can join again with the link unless you turn it off.", and the ⓘ sheet adds "Someone you remove can join again with the link, unless you turn it off."
12. The event page has no Choose people entry, since inviting from contacts is out of scope (GI-D3). People stays on Profile.
13. The page’s link opens the app also with a trailing slash, a query (such as `?fbclid=…`) or a fragment, which are ignored. The `resbite://` forms stay exact, and `/r?…` or `/r#…` lands on the invite screen.
14. Every `/r/<code>` and `/r/<code>/image` path reaches the page functions, with no pattern on the code, so a truncated or malformed link shows the inactive page with its headers instead of Vercel’s bare 404.
15. Do this again copies the area too.

Each GI1 database migration needs the owner’s explicit approval. The hosted migration goes live together with the new TestFlight build, because build 8 can’t open `/r/` links. Old per-person links keep working.

## GI2 — 22 October 2026

Decisions from the GI2 design ([spec](../docs/superpowers/specs/2026-10-21-gi2-guest-accounts-design.md), [plan](../docs/superpowers/plans/2026-10-21-gi2.md)). GI2 lets a friend of the host create an account from the event link, join and reply. The calls marked as the controller’s are listed for the owner’s review at the end of the spec.

| # | Decision |
| --- | --- |
| GI2-D1 | **One access source next to the roster.** `private.beta_access` holds link-made grants; `eligible()` accepts a roster row or a live grant. Nothing else in the app’s reading, notification or deletion rules changes shape. (22 October 2026) |
| GI2-D2 | **The guest’s account is created by Supabase Auth, then one database call joins them**: `join_by_link(code, name, terms_version)` records the attestation, grants access, creates the profile and the attendance, and notifies the host, in one transaction. No grant without a successful join through a live link. (22 October 2026) |
| GI2-D3 | **The tick comes first, and the buttons stay disabled until it is ticked**, exactly as Stephen requested on 19 October ("I’m 18 or over" / "I agree to the Terms and Privacy Policy."). The tick is sent with the join call, so an account that exists without an attestation (the app closed in between) is asked again next time and gets nothing until then. (22 October 2026) |
| GI2-D4 | **Email means a six-digit code, no password**, as the FU brief says, for guests. Existing password accounts keep signing in on the sign-in screen. A code sent to an address that already has an account signs into that account (one identity per person). (22 October 2026) |
| GI2-D5 | **Google stays on the guest screen** because the browser flow already exists; Apple is the new native path. Both appear on the guest screen and the sign-in screen. (22 October 2026) |
| GI2-D6 | **The reply keeps Maybe.** The boards draw Going and Can’t go only; the app shipped Maybe in UX2 and the owner has not retired it. Screen 06 is the existing event page. (22 October 2026) |
| GI2-D7 | **Screen 07 is the existing event page after a reply**: the exact address, Add to calendar and reminders (UX3). The notifications ask card and the chat link wait for B1 and the chat. (22 October 2026) |
| GI2-D8 | **Guests skip "About you"** and the interest questions; the name is the only thing asked, and only when Apple or Google do not supply one. (22 October 2026) |
| GI2-D9 | **Link opens are counted, nothing more.** A row per open with the link id and a timestamp, written by an anonymous call; no device id, no address. The privacy sheet says so. Page views come from Vercel’s logs. (22 October 2026) |
| GI2-D10 | **Deletion works for link-made accounts and is on in this build**; Apple accounts prove it is them by signing in with Apple again rather than by an emailed code (Apple’s relay address may not deliver it). The raw deletion RPC is retired in the same migration. (22 October 2026) |

**Calls made during the build (22 October 2026), for the owner’s review.**
1. The migration is split in two, as UX2 and UX3 were: `20261022120000_gi2_guest_accounts.sql` is hosted-compatible, and `20261022120001_gi2_local_delivery_and_deletion.sql` is local-only, because the hosted project lacks the deletion lifecycle and the notification sender; the companion goes live with them, so GI2-D10’s "deletion is on" waits for those migrations on hosted.
2. The rollback is split the same way, and the hosted rollback alone is incomplete wherever the companion has run, so the companion’s rollback follows it in the same transaction.
3. `eligible()` keeps its execute grants exactly as they were (no revoke from public), because the row-level policies call it as `anon` too and a redefinition must not change who may call it.
4. The companion does not copy `join_by_link`: the hosted file defines a helper `private.deletion_pending(user)`, which `join_by_link` calls, and the companion redefines only the helper to add the deletion-job check.
5. `join_by_link` takes the per-user lock with seed 47 (what `require_tester` uses), puts the grant condition inside the user checks so banned or anonymous grant holders stay out, and guards the profile insert with an IF.
6. `join_by_link` raises on a missing user, takes the lock, and only then runs the account and deletion checks, so a deletion that commits while a join waits is seen and nothing is written.
7. `join_by_link` refuses a link whose organizer is no longer eligible (through a new `private.user_eligible`, which `eligible()` delegates to), and an organizer who has left the roster does not re-admit themselves through their own link, because a ban that leaves the banned organizer’s links admitting guests is not a ban.
8. A person who is not eligible but is already on the event gets the grant and no new "invitation" notice, because GI1’s early return sends none for existing attendees; the host is told only of a new attendance.
9. `supabase/tests/deletion.sql` now calls `private.request_account_deletion` as `service_role` and asserts that `service_role` cannot execute the public wrapper, because the file described the state before the raw RPC was retired.
10. The Apple button is the kit’s chip with Apple’s own logo mark (`AppleMark`, drawn with `react-native-svg`), not lucide’s apple glyph and not the native `AppleAuthenticationButton`, which lacks the kit’s disabled state and accessibility.
11. The guest tests use an injectable-deps factory (`createGuestJoin(deps)`), because no `rsvp.test.ts` pattern existed to follow.
12. The two link functions take `p_code`, the real argument name; the first draft sent `code` and would have failed on the database.
13. A wrong code and an expired code arrive as one message from Supabase, so the app shows "expired" only when the time since the send is 600 seconds or more (the hosted OTP expiry), and the mismatch copy otherwise.
14. A status of 0 or 500 and above, or a thrown call, is a connection failure and shows "Check your connection and try again."; a verify lost to the connection keeps the digits and offers Retry.
15. The guest screen grew a state hook (`useGuestAccount.ts`) and a `GuestSteps.tsx` split beyond the brief’s file list, and a `signin` refusal shows the three providers again, because routing to `/account` would loop back to `/invite`.
16. On the guest screen, Close when signed in drops the kept code and the kept tick before leaving, so `/account` shows the waiting card with Sign out instead of looping back to `/invite`; the spec’s redirect stays.
17. A dead preview (cancelled, happened or inactive) skips the parallel join and drops the kept code at once, as GI1 drops refused links.
18. The gateway reads `providers` from the verified claims’ `app_metadata` (strings only, default empty), so the deletion screen and the Edge check use the same list.
19. Apple confirms deletion through the isolated auth client the password and code paths use, so the app’s session never changes and a wrong Apple ID is refused by the existing different-account check; the red submit button becomes "Continue with Apple" and runs Apple, then the request, inside the five-minute window.
20. The `delete-account` Edge function accepts a fresh `oauth` sign-in when the account’s providers are `["apple","google"]` and not email, which counts a linked Apple and Google account as Apple-only; the app offers no linking today.
21. Strings not in the plan were accepted and listed for the owner’s copy pass: "6-digit code", "Retry", the spinner labels and "You’re invited".
22. Disabling a roster row keeps that person out of link joins too (`join_by_link` refuses them with "Invitation unavailable" before writing anything); a revoked grant is the ban for link-made accounts.

Each GI2 database migration needs the owner’s explicit approval, by file name and sha256. The hosted migration goes live together with build 10 and the `delete-account` redeploy; the companion waits for the deletion lifecycle and the notification sender.

## Contact invitations, 27 October 2026

Decisions from the contact-invitations design ([spec](../docs/superpowers/specs/2026-10-27-contact-invitations-design.md)), agreed with the owner in conversation on 27 October 2026, and the proposals he accepted. Phone accounts ([plan](../docs/superpowers/plans/2026-10-27-phone-accounts.md)) is the first of four plans; the calls made while building it follow.

**The owner's decisions.**

| # | Decision |
| --- | --- |
| CI-D1 | Nobody joins an event unless the host invited them personally or approved them. Forwarded links must not let anyone in. (27 October 2026) |
| CI-D2 | The host invites from their phone contacts. Each invitation is tied to the invitee's phone number. (27 October 2026) |
| CI-D3 | A contact who already has a Resbite account gets a direct in-app invitation: no link, no code. (27 October 2026) |
| CI-D4 | A contact without an account gets a personal link to `link.resbite.com`. There they confirm the invited number with a code before they can answer. (27 October 2026) |
| CI-D5 | After answering on the web they see the "get the app" screen, direction **A**: "You're going!", a list of what the app gives them, one "Get Resbite" button, "Sign up with +44 ••• 834 and this resbite will be waiting", and a small "Not now". (27 October 2026) |
| CI-D6 | In the app they create their account with the same phone number, and the event is already there. (27 October 2026) |
| CI-D7 | A verified phone number is required on **every** account, including existing email, Google and Apple accounts. (27 October 2026) |
| CI-D8 | Sign in with Apple and Google stay, as the quick way to fill in name and email during onboarding. The phone is required on top. (27 October 2026) |
| CI-D9 | The open event link stays. Everyone who answers through it waits for the host to approve or decline them. (27 October 2026) |
| CI-D10 | No paid SMS service yet. (27 October 2026) |
| CI-D11 | Push notifications are part of this work. (27 October 2026) |
| CI-D12 | Groups and circles of trust are the next project, designed separately on top of this one. (27 October 2026) |
| CI-D13 | **Test mode for now:** keep the whole flow, but every code step accepts **000000 for any number**, with no SMS sent, so the complete journey can be tested without paying for SMS. The owner chose "any number" over a list of registered test numbers after hearing the risk (see "Test mode" in the spec). (27 October 2026) |

**Accepted proposals.**

| # | Proposal |
| --- | --- |
| CI-P1 | **Sending:** the host sends personal links from their own phone. WhatsApp or Messages opens with that person and their link filled in. Resbite never sends texts itself. One send per person is accepted, because each link is tied to one number. (27 October 2026) |
| CI-P2 | **Codes before paying:** the real path is Supabase's phone sign-in, with a provider connected later through Supabase's Send SMS hook. Until then, test mode (CI-D13) stands in for the code check. *Amended 27 October: the owner replaced "registered test numbers only" with test mode for any number.* (27 October 2026) |
| CI-P3 | **Contact lookup:** only the numbers the host actually picks are checked against accounts, at that moment. The address book is never uploaded. (27 October 2026) |
| CI-P4 | **What the web page shows:** who invited them, title, time, rough area, the going count, and "This invitation is for the number ending ••34". The exact address, meeting details and other guests' names stay in the app; direction A lists them as reasons to install. (27 October 2026) |
| CI-P5 | **Number check:** the invitee types their number, and a code is sent only when it matches the invited one. The page never reveals the full number. (27 October 2026) |
| CI-P6 | **After "Can't go":** a softer version of the screen ("Marcos will know" and a smaller nudge to get Resbite). (27 October 2026) |
| CI-P7 | **Web verification creates the account:** confirming the number on the web creates their Resbite account, tied to that phone, holding their first name and answer. In the app they sign in with the same number. The phone number carries them across, so "tap the link again" is no longer needed. (27 October 2026) |
| CI-P8 | **App sign-up order:** number and code first, then "Continue with Apple" or "Continue with Google" to fill name and email, or type the name. The 18+ and terms tick from GI2 stays on the first screen. (27 October 2026) |
| CI-P9 | **Existing accounts:** the next time they open the app, "Add your phone number" appears before anything else, once. (27 October 2026) |
| CI-P10 | **Email and password:** new accounts no longer use them. Existing password accounts keep signing in, but must add a phone (CI-P9). (27 October 2026) |
| CI-P11 | **Shorter sign-up:** birth date, city and interests leave sign-up and stay optional in Account details. (27 October 2026) |
| CI-P12 | **Linking providers:** Apple and Google attach to a phone account through Supabase identity linking. It must be enabled in the project and confirmed to work with native Apple sign-in. (27 October 2026) |
| CI-P13 | **Push in scope**, because the in-app invitation (CI-D3) and the "get the app" promises (CI-D5) depend on it. (27 October 2026) |

**Calls made during the phone accounts build (27 October 2026), for the owner's review.**
1. The Send SMS hook and the code exchange are each one `SECURITY DEFINER` function in `public` (`send_sms_hook`, `exchange_test_code`), not a `private` body with an invoker front, because Auth's role and the signed-out app have no usage on schema `private`. The grants stay narrow: the hook to `supabase_auth_admin`, the exchange to `anon` and `authenticated`.
2. The test-mode log has no foreign key on `user_id`. Auth may call the hook before a new user's row is visible, and a foreign key violation would make every sign-up code fail. The cost is that log rows can name deleted users.
3. A roster match needs a confirmed email. A confirmed phone or email makes an account confirmed, but an unproven email must never grant access through the roster (CI-D1); a live link grant needs only the account's confirmation. The companion migration carries the same rule.
4. `reviewed` in the account state means a verified phone, nothing else. CI-P9 makes the phone gate block the rest of the app and CI-P11 takes the details review out of sign-up. An approved account without a verified phone goes to "Add your number" before any deep link works.
5. `formatPhone` accepts digits-only input by adding the missing `+`, because `auth.users.phone` and the user object hold digits only.
6. In live mode 000000 is still sent to the server as typed and the server refuses it, so the person sees the mismatch copy, the cells clear and nobody signs in. The 18+ tick, remembered for that number just before the check, is dropped when the check fails and remembered again before the next one, so a refused code records nothing (see 10). The app does not try to guess the mode.
7. Numbers are accepted when `libphonenumber-js` says they are possible, not valid, because the UK range reserved for fiction (`07700 900000` to `900999`), used for test friends, is reported invalid by its metadata (checked with 1.13.15).
8. Rolling back restores GI2's hosted `user_eligible` body. Where the local-only companion exists, its deletion-aware check is dropped until the companion is re-applied, so the companion is rolled back first and this migration second.
9. This migration also redefines `join_by_link`: GI2's hosted body, verbatim except its confirmed check, which now takes a confirmed email or phone. Without it a phone-only account opening a GI2 event link was refused as signed out and pushed toward a second account, and an app-only stop-gap risked a redirect loop. Grants and the public façade are unchanged; the rollback restores GI2's body and the hosted rehearsal fingerprints both functions. The cost is that phone-only accounts can join by a link before Plan 3 replaces it with a waiting request, as email accounts already can. (Final review, ruling R15.)
10. The 18+ tick from sign-up is kept in memory with the number it was ticked for, and recorded only when the signed-in account's phone has the same digits; another account leaves it waiting. A failed sign-up check and sign-out drop it, and it is never stored on the device. Before, a tick left by a failed check could be recorded for whichever account signed in next on the device. If the app is killed between the check and the record, the tick is lost; nothing enforces it yet. (Final review, ruling R16.)

Each phone accounts rollout step needs the owner's explicit approval; the runbook is in `qa/phone-accounts-2026-10-27/README.md`.

**Calls made during the contact invitations build (28 October 2026, plan 2 of 4), for the owner's review.** Cited by task, because the ledger's ruling numbers restart in each task; the rollout runbook is in `qa/contact-invites-2026-10-28/README.md`.
1. **One lock, one budget (Task 1).** Looking up who is on Resbite and inviting both take a per-user advisory lock first, so two requests at once cannot read the same count and slip past the limit. Lookups and invitations share one budget of 500 numbers per person per day (UTC), because inviting also tells the host who is on Resbite and the spec's rate limit covers any way of learning that. The cost: a very active host sees "Try again tomorrow" after 500 numbers in a day.
2. **Who an answer lets in (Task 2).** A personal link gives access to the app only through a host who may still use it, as `join_by_link` already does (CI-D1): an answer through a host who no longer qualifies is refused as "Invitation unavailable", and a disabled tester is refused. Answering again with the same response changes nothing (no new version, no second notice to the host), like `respond`; a changed answer does bump the version.
3. **Folding a web-only account (Task 3).** The fold is one `SECURITY DEFINER` function in `public`, executable only by `service_role`, with no schema grant. The plan's invoker front would not work, because `service_role` has no usage on `private` (the plan was amended). A tester whose roster row is disabled gets their data moved but no working access from a fold. The folded account keeps only a ban: its live access and its 18+ record are deleted after being copied, so a fold that stops half way cannot leave a second usable account ("one person, one account").
4. **The invite screen (Task 7).** One row per person. A person with several usable numbers asks "Which number?" and only one number per person can be picked. WhatsApp opens with the person and the link filled in, through `whatsapp://send`, only when WhatsApp is installed (iOS needs `LSApplicationQueriesSchemes` in the new native build; otherwise the screen says "WhatsApp isn't installed. Try Messages." and records nothing). The screen's words moved into `inviteCopy`, with hints on rows and buttons, and the "+44 ✕" chip bug was fixed. Android needs `<queries>` for WhatsApp (B8).
5. **My resbites (Task 8).** An invitation that has been answered leaves Upcoming and shows under Invitations only. "Send again" works from any phone: where this phone has no stored code, it makes a fresh code for that one number and opens the composer. The old link stops working, which is the known limit that a host's codes live on their phone.
6. **Add your number and folds (Task 9).** After a fold fails for a reason that isn't a wrong code, the app refreshes the account first; if the account already holds the verified number the fold counted as done. Retry calls the function again without verifying the number again (the isolated session is kept in memory for the screen's life). A 503 ("not switched on") blocks Retry.
7. **Honest fold results (final review, F1).** The function answers a fold the database refuses (`22023`) with 409, not 500. The app shows "not switched on" for a missing function (404) as for a gated one (503), and the taken copy for a refusal (403, 409); all four drop the verified proof and hide Retry, so a spent code is never verified again. The offer is conditional ("If this number answered an invitation on the web…"), since the app can't tell a web-only account from an app account before the function answers, and its button is "Confirm with a code", so the screen no longer has two "Send code" buttons.
8. **No second account while folding is off (final review, F2).** The taken copy no longer says to sign in with that number, which would make a second account; it says to use a different number or ask the Resbite team for help (one sentence for both copies). The runbook makes the fold release a precondition of the link site and the app build that send personal links; until then, personal links are held back from existing testers. The cost is one more rollout step.
9. **The web page on a shared computer (final review, F3).** Minimal fix now: "Not you? Sign out" on the answer and "get the app" steps (a local GoTrue logout, whose failure is ignored, and the kept session cleared at once); the session is kept per invitation code with the full verified number and restored only on an exact match (the 2-digit ending match is gone); every kept session is dropped once its event starts. Flow 3.5 needs some persistence, so the stricter option (log out right after answering, verify again to change the answer) goes to the owner. "+44 (0) 7700 900834" now composes as +447700900834.
10. **Send again without WhatsApp (final review, F4).** Each Invited row offers WhatsApp and Messages, as Almost there does, the one used last first, so "WhatsApp isn't installed. Try Messages." always has Messages beside it. A code minted for a number this phone had none for is kept for the screen, so the fallback sends the same new link.
11. **Smaller fixes before the migration is applied (final review, F5).** Re-inviting a revoked invitation clears who answered it; inviting someone in the app turns off their live personal link on that event; the lookup's "On Resbite" also needs a profile, as the in-app invitation does; `phone_invitations` (`user_id`, and `invited_by`, now nullable) and `lookup_usage` reference `auth.users` (set null, and cascade); invitations go to the server 50 at a time, like lookups; and `fold-phone-account` joins the release-gate test of destructive entry points.

Each contact invitations rollout step needs the owner's explicit approval.

## Open-link approval, 28 October 2026

Plan 3 of 4 for contact invitations ([plan](../docs/superpowers/plans/2026-10-28-open-link-approval.md)) carries out CI-D9: the open event link stays, and everyone who answers through it waits for the host. These are the calls made while building it, for the owner's review, grouped by area. The rollout runbook is in `qa/open-link-approval-2026-10-29/README.md`.

**Database.**
1. **The app's waiting screen can change an answer by plan.** A new function, `change_join_answer(p_plan, p_response)`, lets a waiting person change their answer. The screen knows the plan, not always the link's code, so a code-based call would not always work. The cost if wrong: one more function.
2. **A stored answer is never replaced by "pending".** The app opens a link with `pending` (no answer yet), and old builds reach `claim_plan_link` and `join_by_link`, which carry no answer. Someone who already answered and opens the link again keeps their answer; a fresh `pending` cannot clear it. `change_join_answer` still can change it. The cost: a person cannot return to "no answer" by opening the link.
3. **Hosts deciding at once do not deadlock.** `decide_join_request` takes the two people's locks in `uuid` order before it checks the host owns the event. Two hosts approving each other's requests would otherwise wait on each other once account deletion also takes these locks. There is a concurrency script for it. The cost: none.
4. **People who may already use the app are not asked again.** Testers and grant holders skip the 18+ tick, as `join_by_link` never asked them, because testers from before GI2 have no tick on record. They still give a name if they have no profile (otherwise the request would fail with a raw foreign key error). Approval also refuses (with "Invitation unavailable") anyone with a revoked grant, a disabled roster row, or an account that is banned, being deleted, anonymous or unconfirmed, even if they may use the app.
5. **A fold moves requests.** `fold_web_account` is redefined to move the folded account's requests to the account that takes the number (skipping a request where the account already has one, is on the event, or owns it). The spec's flow 5 says answers move over, and without this the cascade would delete them. The rollback restores the earlier body.
6. **Accepted without change:** a person declined on a link can ask once more after the host turns that link off and makes a new one; `my_join_request` hides rows that no longer apply; a waiting person whose account is being deleted does not show to the host.

**Rollback.**
7. **Approved guests keep their access.** The rollback turns every approval grant into a link grant on the same row; live stays live and revoked stays revoked, so a ban stays a ban. GI2 gave a link grant for the same path, and deleting the grants would lock approved guests out of events they were admitted to. If this is wrong, a follow-up delete is easy.

**Web page.**
8. **The calling code defaults to 44.** The beta is UK-based and no host country is stored. The page says "Outside the UK?" beside it, and any number can answer an open link. The cost if wrong: copy and one attribute.
9. **Can't go on an open link looks like a personal page's Can't go.** It shows the soft screen ("the host will know" and a small nudge to get Resbite), not "will confirm your spot". The spec's line is about taking a spot, and "confirm your spot" reads wrong after Can't go. The cost: one copy swap.
10. **"I have Resbite: open the app" stays on the first screen** (`resbite://r/<code>`), as in GI1. The spec says Resbite users opening the link in the app get the waiting state. The cost: one button.
11. **The page looks up the request after verifying the number.** WhatsApp and Instagram's in-app browsers keep their own storage, so a person returning through one has no kept session, and that is the common way back. Without the lookup they would not see their waiting answer. The cost: one extra read.

**App.**
12. **"I have an account" goes to the sign-in screen,** `/auth/phone?intent=signin`, and the account gate runs before the request is made. The email-code step from GI2 was removed only where nothing else used it.
13. **The app sends the About you name with the request.** A waiting phone account has no profile, so the request needs a name. The spec said "no name"; this is the accepted deviation.
14. **The 18+ tick appears inline when the server asks for it.** On "Age confirmation required" the app shows the existing tick and terms line on the same screen and resends the request with the terms version.
15. **People whose access is pending see their requests on Account.** After Done they would otherwise land on Account with no sign that they had asked, and this is the main path for new people arriving by an open link. They go to Account rather than My resbites because My resbites is not open to them yet.
16. **Small gaps in the app services are left.** `mine()` and `forPlan` turn a missing string into an empty one rather than rejecting. The columns are not null in the database, so only a broken server returns such a row. The cost if wrong: a blank field on screen.

**Host.**
17. **A failed decision's message stays until the list empties.** A failed decision is followed by a reload of the list, so clearing the message on each reload would hide its own message. It clears when the list becomes empty and shows the reason the server gave, not the offline line. The cost: a stale note until the next decision.

Each open-link approval rollout step needs the owner's explicit approval.

## Push notifications, 29 October 2026

Plan 4 of 4 for contact invitations ([plan](../docs/superpowers/plans/2026-10-29-push-notifications.md)) carries out CI-D11: push is switched on for the events in the spec's Notifications section. These are the calls made while building it, for the owner's review, grouped by area. The rollout runbook is in `qa/push-notifications-2026-10-30/README.md`.

**Database.**
1. **One new migration instead of promoting the four local-only files.** `20261030120000_push_delivery.sql` carries the push parts of `20260918001308`, `20261014130000`, `20261015130000` and `20261022120001` in one idempotent file. The owner approves one file, and the account-deletion lifecycle stays untouched. The cost: some definitions are written twice, which a structure test in the SQL suite guards in full mode.
2. **Any confirmed, non-banned, non-deleting account may register a device,** not only testers. A person waiting for the host's approval must get the "approved" push, and they cannot use the app yet. Delivery is still decided at claim time, so registering gives no access.
3. **A request notice is tied to the waiting period.** The host does not get "Sam asked to join" for a request they have already approved or declined, and a guest who changed their answer is still notified once. The check is that the request is still waiting and was made no later than the notice, and it also leaves out a person who is already on the event (an attendee), as the host's list of requests does. Why: tying the notice to the request's waiting period, not to the person alone, keeps a changed answer working, and someone already on the event is never announced as asking.
4. **A fold drops the folded account's request notices when the other account already has a request.** Otherwise the person could be told twice about the same event. A missing platform is refused with `22023`.
5. **The open-link rollback refuses to run while push is installed.** The push audience check reads the requests table that the open-link rollback drops, and the push rollback restores the open-link fold that the open-link rollback then replaces. Enforcing the order in the file is safer than relying on the runbook. Plan 3's rollback hash and records were updated.
6. **Hosted-baseline commands pass all four candidates.** The list of tests assumes every pending candidate is applied, so the three-candidate commands in the plan 1 to 3 runbooks now fail at `push-delivery.sql`. Updating the commands and noting the convention in `supabase/README.md` is cheaper than changing the test harness.

**Sender.**
7. **Scheduling is an owner-run script, not a migration.** `supabase/ops/schedule-deliver-notifications.sql` uses pg_cron, pg_net and Vault, which the local Docker test harness does not have, so a migration could not be tested.

**App.**
8. **A tap from a signed-in account that isn't approved yet refreshes the account once, then routes.** Approved goes to the event; still waiting goes to Account. "Approved" pushes go to waiting people whose cached status is stale, so dropping the tap would lose exactly the case that matters. The wait is capped at 10 seconds.
9. **A stale record for another account, with no live session, is replaced when the current account registers.** Why: the old account's pushes must not reach the new person's phone. The server rebinds the token, and the claim suppresses deliveries to the old binding.
10. **An offline sign-out with a registered device stays refused,** with "Couldn’t sign out. Connect to the internet and try again, so this phone stops getting your notifications." Signing out while still registered would leave the old account's pushes on the phone. (Narrowed by 17: only a request that never reached the server refuses.)
11. **A damaged push record is forgotten at sign-out, and treated as absent at registration.** Being locked out of sign-out is worse than a possibly stale token, which a rebind or a "device not registered" answer from the provider clears later.
12. **A web-only seam for push states is allowed for QA,** in its own commit with no native effect. Without it, the browser checks cannot show the settings chip's states, because push is always "not active" on the web.

**The ask.**
13. **The UX3 "Get reminders?" sheet becomes the single ask.** iOS has one notification permission, so one question serves reminders and updates. The cost: the reminders copy changed.
14. **The ask has its own device flag.** People who said Not now to "Get reminders?" are asked once about notifications, and nobody is asked once the permission is decided. UX3's flag is kept as stored but no longer read.
15. **The Updates chip never alarms.** Still checking reads "Checking…", a failed or unknown setup reads "Not set up yet" with Try again, and the ask also turns on reminders as the old sheet did. An explicit switch-off of Event reminders is respected.
16. **Waiting people are asked on the same moments as everyone else** (after answering through the waiting screen with Going or Maybe, for example), because a waiting person is the one who needs the approval push.

**Final review fixes (30 October 2026).**
17. **Any answer from the server releases sign-out.** Sign-out is refused only when the unregister request never reached the server (offline, or no answer within 15 seconds), with the message in 10. Any HTTP answer, a 401 for an expired session, a 404 after the push rollback or a 500 included, forgets this phone's record and lets sign-out go ahead. Why: the server answered, so retrying can't help, and locking the person in is worse. The cost: the endpoint may stay bound on the server until another account rebinds it on that phone.
18. **The waiting screen asks from the stored answer.** Its moment is the answer just saved there, or else the stored answer of a request still waiting, so a person who answered Going or Maybe on the web and then signed in while waiting is asked once without changing anything. Without it, their approval push had no device to go to.
19. **A failed read is not "gone".** A tap whose plan reads empty (removed, declined, cancelled) lands on My resbites with the gone note, as before. A tap whose read fails (offline, timed out, a server error) opens the event page, which has its own retry and offline states.
20. **Sign-out clears the pushes still shown.** After the endpoint's removal and before auth sign-out, every presented notification typed `plan_update` is dismissed, so another account on the phone never sees the previous one's titles. Best effort, capped at 3 seconds: it never fails or holds up sign-out.
21. **`unregister_device` follows the house pattern.** Its body is `private.unregister_device`, a security definer with an empty search path, behind a public SQL invoker façade, as `register_device` is; both are granted to `authenticated` only. Its behaviour is unchanged: it deletes only the caller's own row. Also: the app registers once the profile exists (after a request to join, which makes a waiting account's profile, and after the first profile save), since `register_device` needs one.

Each push rollout step needs the owner's explicit approval.

## Creating a resbite (CR), 28 October 2026

Creating a resbite ([spec](../docs/superpowers/specs/2026-10-28-creating-a-resbite-design.md)) is built in three plans: the database, the plan screen, and the resbite page with More and the people list. One line each; the spec holds the reasons.

**Decisions.**
- **CR-D1.** Build Option B with the dev brief's rules; the wireframes set the layout, and where a brief rule and a wireframe differ the brief wins.
- **CR-D2.** Inviting is the contact-invitation flow already on `main` (in-app invitations, personal WhatsApp/Messages links, the open link with host approval), not the brief's single shared link.
- **CR-D3.** Maybe stays (UX2 added it everywhere); the brief's Going-and-Can’t-go-only rule is dropped.
- **CR-D4.** A cancellation notice goes to everyone invited (UX2), not only to people going.
- **CR-D5.** No drafts: a resbite exists or is discarded; closing with changes asks “Discard this resbite?”.
- **CR-D6.** The end time is required for every new or edited resbite, with duration shortcuts; older resbites keep their start only until edited.
- **CR-D7.** No Chat row until the CH flow is built; the page leaves its place at the end.
- **CR-D8.** Admins are in: the owner appoints them from the people list (Make admin, Remove as admin on a Going guest); they can do everything the owner can except remove the owner or manage admins.
- **CR-D9.** Mute this resbite is in, per person.
- **CR-D10.** Where offers recent places and “To be decided” now; address search and saved places wait for a places service.
- **CR-D11.** No “Report this resbite” row until the report flow exists.
- **CR-D12.** Video-call links (Google Meet, Zoom, Teams) are refused in any text field.
- **CR-D13.** iOS first; Android back and swipe-to-close are specified so the Android build does the same later.
- **CR-D14.** A resbite stops accepting changes at its end time, not its start: edit, cancel, invite, replies, requests and removals all work until the end.
- **CR-D15.** Admins may cancel the resbite; guests never can.
- **CR-D16.** A resbite can repeat (“every Thursday”): a Repeats choice on the When sheet, the next occurrence created by itself (CR-P22 to CR-P26).

**Calls made while writing the spec.**
- **CR-P1.** The plan screen also carries Description and Categories (one or two of the seven approved), so “Start from scratch” can fill what an idea would.
- **CR-P2.** Area and Meeting details live at the bottom of the Where sheet, both optional.
- **CR-P3.** The open event link leaves the resbite page: Share, Copy link and Turn off move into the Invite screen under the contacts.
- **CR-P4.** The people row shows Going, Maybe (when any) and Can’t go counts, plus invited and waiting for hosts; it opens a full-page people list in groups, with one three-dots sheet per person.
- **CR-P5.** Superseded by CR-D15.
- **CR-P6.** Superseded by CR-P18.
- **CR-P7.** Mute silences that resbite’s pushes and reminders for the person who taps it, stored on the server; the global reminders switch stays in Notifications settings.
- **CR-P8.** Video-call detection matches meet.google.com, zoom.us, teams.microsoft.com and teams.live.com in every text field, on Create and on Save, with a message in place.
- **CR-P9.** “To be decided” is a stored flag on the plan, so every surface can say “Place to be decided” and Maps is never offered.
- **CR-P10.** Do this again opens the plan screen pre-filled with everything but When; it is the main action after the end and sits in More before.
- **CR-P11.** Headers follow GL 13: the idea and the resbite are content pages, New resbite and Edit resbite are tasks, When, Where, More and the discard question are sheets, It’s on! is a moment.
- **CR-P12.** The “Reminders on” chip goes; reminders stay automatic for hosts, admins and people going or Maybe, and Mute stops them for one resbite.
- **CR-P13.** The idempotent-create journal stays, so Create can be retried safely after a lost connection.
- **CR-P14.** All day sets 00:00 to 23:59 of the chosen date; an end may cross midnight and then shows its date.
- **CR-P15.** An admin keeps the reply they had; More has Change my reply in the sheet itself, and Can’t go ends the admin role at once.
- **CR-P16.** Invited, not answered yet holds app invitations (Remove) and personal links (Send again, Remove); Send again shows only for links this phone sent.
- **CR-P17.** Admins get the notices the owner gets as host; a change by an admin is told to the owner and other admins, never to whoever made it.
- **CR-P18.** “Save and notify N people” counts the people the database will tell; the button says Save when neither time nor place changed.
- **CR-P19.** A guest who hasn’t answered sees the Going · Maybe · Can’t go control as the bottom row and no More; once answered, the reply with Change, and More.
- **CR-P20.** A resbite ends the same day or the next (one Date row); longer resbites are not supported in this build.
- **CR-P21.** After the end the page is read-only: hosts see Do this again alone, a guest sees the reply as text, and More is not shown.
- **CR-P22.** Repeating resbites roll one occurrence ahead when one ends or is cancelled on its own, with no end date; each occurrence is its own resbite.
- **CR-P23.** Repeats is set at the bottom of the When sheet (Doesn’t repeat, Every week, Every 2 weeks); the page shows “Every Thursday” on a second line.
- **CR-P24.** The next occurrence carries everyone invited in the app (except people removed) and the admins, with replies empty; link-only invitees are not carried.
- **CR-P25.** Edit changes this occurrence and the next is copied from it; Cancel on a repeating resbite offers “Cancel just this one” and “Cancel this and stop repeating”.
- **CR-P26.** Repeats are stored as repeat_weeks, series_id and repeats_from, rolled by a private function run by pg_cron every five minutes from an owner-run script; mutes are keyed by series.

## Connections (CO), 10 November 2026

Connections ([spec](../docs/superpowers/specs/2026-11-10-connections-and-circles-design.md)) are built in plan 1 (connections; branch `co1-connections`), live on the hosted project since 11 November 2026 (migration applied, `deliver-notifications` redeployed at version 4); the TestFlight build and the device checks are pending. The circle of trust is plan 2, built on branch `co2-circles-of-trust` and awaiting rollout (below). One line each; the spec holds the reasons.

**Decisions.**
- **CO-D1.** Two kinds of people to invite: phone contacts with a Resbite account, as today, and Resbite connections.
- **CO-D2.** A connection is earned, not searched: no place to browse or look people up; you connect only with someone invited to, or at, the same resbite.
- **CO-D3.** The other person has to accept; until then nothing changes for either.
- **CO-D4.** Circles of trust: the host sets how many each person may bring (invites) and how far trust travels (levels). Built in plan 2.
- **CO-D5.** People brought inside the circle are in without approval; the host can still remove them. Built in plan 2.
- **CO-D6.** The open link is the host's door: everyone who answers through it waits for approval, connections included (overrides the IN brief).
- **CO-D7.** Real accounts only: no unnamed plus-ones; they stay on the for-later list. Plan 2 holds to it: a guest brings a connection, or a phone contact who signs up.
- **CO-D8.** The three mockups of 10 November are the design of the screens (CO-01 to CO-07).

**Calls made while writing the spec.**
- **CO-P1.** Connect lives on the people list: every row gets the three dots for everyone; a guest's sheet holds the connection action only.
- **CO-P2.** Pedro may ask Ana from a resbite when he can see names there and she is its owner, an admin, or has answered.
- **CO-P3.** A pair is none, requested or connected; the unit is the series; "Not now" is remembered and invisible to the requester, who keeps seeing "Request sent".
- **CO-P4.** A connection lets each appear under "Your connections" on the other's Invite people, and read each other's name and avatar; nothing else.
- **CO-P5.** Pushes: "Pedro wants to connect" and "You and Ana are now connected"; not now, cancelling and removing are silent; a tap opens Connections.
- **CO-P6.** The Connections screen is a new Profile row above "People & groups" (renamed "People lists"): Requests (newest first), then Connected (alphabetical) with "Met at <title>".
- **CO-P14.** Until blocking exists, Remove connection is the way out, and a removed person cannot ask again from the same series.

**Rulings made while building** (they change what the spec describes).
- **CO-R1.** Refusals are read pair-wide, not per series, and stay invisible to the refused side (the sheet keeps "Request sent · Cancel request"); acceptance clears all refusals between the pair, and a refusal on another series is kept when a real request is sent there (one chance per series).
- **CO-R2.** A refuser who asks back connects at once; a hidden refusal (cancelled by the refused side, or made by a removal) is not a standing request.
- **CO-R3.** Removing a connection records a hidden refusal for the removed side (the build of CO-P14).
- **CO-R4.** `public.connections` has no direct reads (RLS on, no policy); the app reads through `my_connections` (requests and connected only, no `sent`) and `plan_connection_states`.
- **CO-R5.** The people list shows the owner first under Going, badged "Hosting", with the connection actions, and its group titles count that row; the event page's people row still counts guests only.
- **CO-R6.** The Profile row and the People screen are both called "People lists".
- **CO-R7.** A connection invite item (`{user}`) needs an eligible account not pending deletion, else 42501 "Not a connection".
- **CO-R8.** A connection request pushes at most once per pair, series and requester, however often it is cancelled and sent again (a request is not a nudge): its dedupe key is `connect:<a>:<b>:<series>:<requester>`, with no timestamp, and its one notice goes while a request by that person stands; a request from another series gets its own. The acceptance's key keeps the acceptance's exact timestamp.
- Rulings 2 and 17 of the build (request keys carrying the row's exact timestamp, so that a cancelled request sent again pushed again) are superseded by CO-R8 (the build's Ruling 22).
- **CO-R9.** "Met at" on Connections names the series' latest occurrence the caller may read (owner or on its guest list), else nothing ("Met on Resbite"): a guest removed from, or not carried to, a later occurrence never reads its title.

**Follow-ups (plan 3, 11 November 2026; branch `co3-follow-ups`, built, not rolled out).** The runbook is [`qa/connections-follow-ups-2026-11-11/README.md`](../qa/connections-follow-ups-2026-11-11/README.md).
- **CO-R10.** The request push and the Connections card name how the two stand on the resbite, with one rule, `private.pair_standing`. Each counts as going when they own it or their own reply is Going or Maybe; an admin counts by their reply alone. `going`: on, and both going ("You're both going to <title>."). `invited`: not ended, and not `going`, a resbite cancelled before its end included ("You're both invited to <title>."). `met`: ended, not cancelled, and both went ("You were both at <title>."). `were_invited`: ended, and not `met` ("You were both invited to <title>."). The rule has nothing to say (null) when either has no place on that resbite, which a request's own resbite never is. The card then reads a fifth context, `from` ("From <title>", true whatever happened since), as it does when there is no occurrence the caller may read, or the caller may not see its guests (they have not answered it). A notice queued before the change has no detail and keeps the start-time wording. The detail is the request's first notice's, as its key is static (CO-R8).
- CH-P20 (groups and chat) shipped ahead of the groups plan, in the same follow-ups: the roll carries every guest, whatever their reply, so Can't go this week is invited again next week. Guests the earlier roll dropped are not brought back.

**Circles of trust (plan 2, 11 November 2026; branch `co2-circles-of-trust`, built, not rolled out).** The runbook is [`qa/circles-of-trust-2026-11-10/README.md`](../qa/circles-of-trust-2026-11-10/README.md). The migration is `20261111130000_circles_of_trust.sql`; it goes live after, or with, the follow-ups migration.

*The spec's calls, as built.*
- **CO-P7.** The circle is set on Invite people, in a Circle of trust card above the connections, by the owner and admins while the resbite is open. Each person can bring Nobody, 1, 2 or 3 (default Nobody); How far it goes is 1 to 3 levels (default 1). It saves on each tap, and a sentence names a guest who is going.
- **CO-P8.** A guest may bring while the resbite is open, they are Going or Maybe, their level is within the circle's, and an invite is left. Hosts are level 0 and invite instead; a host's guests are level 1; whoever a level-n guest brings is level n+1.
- **CO-P9.** A "Bring someone" row on the resbite page opens Invite people in bring mode: the same pickers, capped at the invites left, with no event link and no circle card. A phone contact's message names both: "Pedro invited you to Ana’s Board game night, <when>. Reply here: <link>". The web page names the inviter, and the hosts hear "Clara is going · brought by Pedro."
- **CO-P10.** An invite is used while the person brought is not answered, Going or Maybe, or holds an unanswered link. It frees when they say Can't go, are removed, or the bringer takes back the invitation.
- **CO-P11.** The people list shows "Brought by Pedro" and indents the brought person under the bringer. Removing someone never removes the people they brought; lowering the numbers removes nobody; Nobody hides Bring someone.
- **CO-P12.** The roll copies the circle, and each carried guest keeps who brought them and their level.
- **CO-P13.** Approval through the open link is unchanged, and an approved person is level 1 with no bringer.
- **CO-P15.** The circle is checked once, inside `invite_contacts`, when the invitation is sent. A sent invitation stands, whatever happens to the circle or the bringer afterwards.

*Calls made while planning and building* (they change what the spec describes).
- **CO-R11.** Carried levels: CO-P12 wins over CO-P8's "carried along a series is level 1". A brought guest the roll carries keeps their bringer and level, so they keep counting for that bringer.
- **CO-R12.** Removals are remembered per series (`private.plan_removals`): whom a host removed, declined or revoked, by account and by number. A guest cannot bring them back, and they cannot answer a guest's link, or a host's link sent before the removal. A host's own later invitation, or an approval, clears the record.
- **CO-R13.** A host sees a guest's unanswered link by its last two digits, as "Number ending ••23 · Invited by link · brought by Pedro": never the number, the name or the channel. The host removes it by its id.
- **CO-R14.** A host's link takes over a bringer's: when a host sends a link to a number a guest's link already reaches, the link becomes the host's (no bringer, level 1), and the bringer's invite is freed. A host's in-app invitation of that person ends the guest's link too.
- **CO-R15.** On the guest list and waiting at the host's door never both hold: whoever joins the list by any path has their waiting request closed. A guest cannot bring someone who is waiting.
- **CO-R16.** A bringer's take-back is theirs, host or not: their own unanswered link or in-app invitation goes with no removal record. An answered link is not taken back by id; the host removes the person through their row. A bringer cannot withdraw someone who is now a host (an admin), or someone the roll carried: only a host removes them.
- **CO-R17.** A first name is `private.first_name`: the first word of `display_name`, with every kind of space treated as one and control characters removed, or none when nothing is left. It replaces the plan's `split_part` definition and agrees with the app's `firstName`, except that it strips control characters, which the app keeps.
- **CO-Q1, the owner question** (challenge ruling C-R11). The roll carries every guest (CH-P20), so a brought person who said Can't go comes back not answered, still counted for their bringer. The bringer's used invites can then exceed the circle's, and they read none left. Built that way by default; the alternative is one condition in the roll. The owner answers before the migration (the runbook's step 0).
- **CO-Q2, the owner question on the rollback.** Keep the bringers' unanswered links live after a rollback, showing their numbers to hosts? The circles rollback restores the hosts' list of links, which gives a host every live link with its number, so before restoring it the rollback revokes every link a guest sent that nobody has answered, and those invitations stop working. Answered links stay live, so their guests can still change their answer; a host reads their numbers only by calling the restored list directly, which no app build does. Built that way by default; the alternative is one statement out of the rollback. The owner answers before the migration (the runbook's step 0).

## Chat core (CH), 11 November 2026

Chat ([spec](../docs/superpowers/specs/2026-11-10-groups-and-chat-design.md)) is built in three plans that ship in one release: core (plan 1), groups (plan 2) and safety (plan 3). Chat core is built on branch `ch1-core`, stacked on the circles branch, and is not rolled out. Its migration is `20261111140000_chat_core.sql`. It goes live after the follow-ups and circles migrations, and never without plans 2 and 3. The release runbook is [`qa/chat-release/README.md`](../qa/chat-release/README.md). One line each; the spec holds the reasons.

**Decisions.**
- **CH-D1.** A group is a repeating resbite, the series the creating-a-resbite build already makes; there is no separate group object. The group rules are built under Chat groups, below.
- **CH-D2.** One chat per series, with its history across occurrences; a one-off's chat lives and dies with it. Built: one `public.chats` row per series.
- **CH-D3.** Everyone in a group is in its chat, whatever this week's reply (built under Chat groups, below). A one-off's chat is for the people going, as built.
- **CH-D4.** A chat closes 48 hours after the end time, not 7 days. Built for one-offs here, and for a group once it stops under Chat groups, below.
- **CH-D5.** Messages live on the server, under access rules, not end-to-end encrypted. Data & privacy says so.
- **CH-D6.** The group-chat mockups of 10 November are the design of the screens.

*The spec's calls, as built in plan 1.*
- **CH-P1.** The chat's identity is the series. A trigger makes the chat row with the plan, and the migration backfills one for every series. Its `is_group` flag exists and stays false until plan 2 sets it.
- **CH-P2.** Who is in a one-off's chat: the owner, the admins, and guests who are Going or Maybe, on the series' current occurrence (`private.chat_member`). Not answered and Can't go are out. The group rule is under Chat groups, below. Folding a web account into an app account moves its messages and its place in the lines with it (build ruling H34).
- **CH-P3.** A one-off's chat follows the reply: Going or Maybe is in, with the whole history; Can't go is out, with the line "Sol can't make it"; a host's removal is out at once.
- **CH-P4.** Leave group is built under Chat groups, below (CH-G17).
- **CH-P5.** Three kinds: `message`, `announcement` and `system`. Plan 1's lines are joined ("Mia joined", "Clara joined · brought by Pedro"), can't make it, new admin, a time or place change (a chip that opens the resbite) and cancelled. A one-off's "ended" is the app's (CH-R8). A removed message shows in place as "Message removed by an admin". The left, "Next one" and group "ended" lines are under Chat groups, below (CH-G15).
- **CH-P6.** Announcements are for hosts, from Announce, one a minute per person per chat ("You can send one announcement a minute."). A one-off's audiences are Going (Going and Maybe; the default) and Everyone invited, which adds the app invitees who haven't answered: they get the push and see the latest on their invitation card. The pinned one is CH-R9's. Tapping it loads back to the message.
- **CH-P7.** Pushes. A message reads "Leo: I can bring the snacks" and an announcement "Announcement from Ana: …", under the resbite's title. The words are one clean line cut at 120 graphemes, and the first name at 30. With no name or no visible words, the push is the generic one. One push a minute per person per chat (CH-R6). A message its reader has already read when the claim expands it is not pushed; a read after that still is (H42), and an announcement is pushed whether read or not; a reader of a minute's first message before the claim gets no push for the rest of that minute either, as the later ones were coalesced into it (same kind as K-S1). A message push older than an hour is dropped, an announcement after a day. A push of someone being deleted carries no name. A blocked person's pushes stop, and no push names them (Chat safety, below, CH-S18). The words show on the lock screen by default (the roadmap's owner table).
- **CH-P8.** Two mutes: Mute this resbite silences everything about it, chat included; Mute chat (`public.chat_mutes`) silences messages only.
- **CH-P9.** Unread is a read mark per person and series. A neutral dot shows on the Chat row and the My resbites card. A person's own messages and lines never count. An open chat is marked read after every read, and on leaving it while the app is active.
- **CH-P10.** Realtime broadcast from the database on the private channel `chat:<series_id>`, carrying `{id, kind, state}` only; the phone reads through the functions after a signal, on focus, on the return to the app, and every 20 seconds while open and not subscribed (CH-R12). The policy lets a person listen when the topic is exactly `chat:<lower-case uuid>`, the row is on that very topic (H34), they may use the app and they are in that chat now (`private.can_listen`). A broadcast that fails is a warning and never stops the write. "Allow public access" off is the owner's dashboard step.
- **CH-P11.** Writing: 1 to 1,000 characters, counted as code points, trimmed of white space and invisible blanks, with at least one visible character, by the same rule on the phone and the server; over 16,000 bytes is refused before any check (H42). A longer paste is cut where a character ends, with "Only the first 1,000 characters fit." Only `http(s)` links open, after "Open <host>?" (CH-R15); phone numbers stay text. Offline, a message waits on the phone with its client id ("Sending…", then "Not sent. Tap to retry."), and a repeat of a client id returns the stored row, after the close too. 30 messages and announcements a minute per person ("Slow down"). A send the close overtook stays as a failed bubble, "This chat closed before it was sent.", with Delete. A closed chat keeps its unsent messages until they are deleted or 7 days old (H32, overruling H26's drop); unsent messages count as left behind when more than 10 seconds from now either way, so a clock moved back counts (H26).
- **CH-P12.** Delete and remove keep the row and drop the words: anyone deletes their own ("Message deleted"), and hosts remove others' ("Message removed by an admin"). A host's own message is deleted, never removed (CH-R13). Both work after the close (CH-R7).
- **CH-P13.** Report and block, the chat rules, the blocked terms and the contact address are built under Chat safety, below (CH-S1 to CH-S30).
- **CH-P14.** The Chat row sits after the people row, and after Bring someone when shown, with the latest line and the dot. Nobody outside the chat sees it: a refused read hides it, and a failed first read shows none. A failed refresh keeps the row last shown, except right after a confirmed answer, which can move the person out. After the close it reads "Chat closed · 23 messages"; a closed chat with no messages shows no row (K-S13).
- **CH-P15.** A one-off closes 48 hours after its end, computed and never stored; a cancelled one is read-only at once. Within the last 48 hours the line reads "This chat closes Mon 17 Nov at 18:00, in 31 hours. Any final words?", with minutes only in the last hour (CH-R11). At the close the field gives way to the closed card without a refocus, and typed words stay under it as "Not sent:". A group's close is under Chat groups, below.
- **CH-P16.** The When sheet reads "The chat closes 48 hours after the end time." It hides while the resbite repeats (Chat groups, below, CH-G8).
- **CH-P17.** The notification ask card shows once, on the first open of a chat the person is in while it is open.
- **CH-P18.** Deleting an account empties its messages and announcements and takes their author (CH-R14), and deletes its reads and mutes; the deletion request runs only where the local deletion lifecycle exists, and the hosted project has none yet. A profile removed any other way, by hand on hosted, loses its words too: when an author becomes nobody, the message empties and a sent one reads deleted (H42). The reports an account filed and its blocks go with it too (Chat safety, below, CH-S7).
- **CH-P19.** "People in this chat · N" opens the people list.

*Calls made while planning and building* (the plan's Decisions 1 to 15, as built; they change what the spec describes).
- **CH-R1.** System lines are written by triggers on guests, plans and admins, in the same transaction as the change; a line has no author, `payload.actor` is who acted, and every other person in it is a uuid. The reads name only `actor`, `user` and `brought_by`, and the app words the line ("Someone" for a name it can't show, "You" for the reader). The roll's and the deletion's flag (`resbite.system`) silence the triggers.
- **CH-R2.** Nobody reads the chat tables directly: RLS on, no policy and no grant to any API role; every read and write is a function. This replaces the spec's select policy on messages.
- **CH-R3.** The chat row per series comes from an `after insert` trigger on plans (create, Do this again, the roll), and a backfill.
- **CH-R4.** Plan 1 alone lets a repeating series follow the one-off rules on its current occurrence, and a real roll write an "admin" line, with no actor, for each admin it carries; so the release never ships plan 1 without plan 2, whose roll sets its flag (Chat groups, below, CH-G23).
- **CH-R5.** Delete and Remove ask in place, "Delete this message for everyone?" and "Remove this message?", with a red button and Keep.
- **CH-R6.** One push a minute is decided when the message is written, not when it is claimed: under the chat's lock, a message queues no push for someone who already has one for that chat from the last 60 seconds, and the first message of the minute is pushed (the cost, K-S1: when that first message is deleted before delivery, nothing that minute is pushed). The claim expands and sends every other kind before the chat kinds (H42). The sender claims again, 25 then 10 at a time, until its 5-second budget is spent; a job it could not start goes back as `deferred`, with its attempt given back. Raising the budget with the schedule's timeout is an offer to the owner in the runbook.
- **CH-R7.** Delete and Remove work after the close (K-S17, below). "Reading only" means no new messages.
- **CH-R8.** A one-off's "<title> ended" is a separator the app computes at the end time. Nothing stores it, and a cancelled one-off has none. A running group's is the roll's stored line, and a stopped group's last occurrence gets the computed one (Chat groups, below).
- **CH-R9.** The pinned announcement is the latest one still sent. Removing or deleting it pins the one before, and so does its author's account deletion.
- **CH-R10.** A reply flipped within 10 minutes updates the person's last joined or can't-go line instead of adding one. Its time stays, and the update signals again. A later line naming the person, such as their appointment, ends the merging (build ruling H33).
- **CH-R11.** The closing line, the closed date and change lines use the plan's zone; stamps and day separators use the phone's. The countdown floors whole hours, shows minutes in the last hour and says "in 1 minute" in the last one (CH-P15 said "under two hours"). A date outside the current year shows the year.
- **CH-R12.** The 20-second poll runs only while the channel is not subscribed. Focus, the return to the app and every signal still read. After three channel errors in a row the chat drops the channel until the next focus.
- **CH-R13.** A host's own message is deleted, never removed, so "Message removed by an admin" never shows on a host's words.
- **CH-R14.** A deleted account's messages and announcements lose their words and their author. Those still sent read "Message deleted"; one a host removed stays removed (build ruling H27). System lines keep their payload, and the person reads as "Someone".
- **CH-R15.** A link opens only when it is `http(s)` to a plain ASCII domain. A non-ASCII host, a punycode label, an IP address, a user part, `localhost` or any control or format character keeps it plain text. The confirm names the host. The finding proposed showing the punycode host instead; not linking is safer against look-alike hosts.

**Owner question, K-S17.** Delete and Remove on a closed chat. Built allowed by default: an author deletes their own message, and hosts remove others', after the close. The alternative, refusing both after the close, is one check in each function and a new migration hash. The owner answers before the release sitting (the runbook's step 0); with no answer, the default ships.

## Chat groups (CH), 12 November 2026

Chat plan 2 of 3 ([plan](../docs/superpowers/plans/2026-11-11-chat-2-groups.md)) makes a repeating resbite's chat a group's. It is built on branch `ch2-groups`, stacked on chat core, and is not rolled out. Its migration is `20261111150000_chat_groups.sql`. It goes live in the same sitting as chat core and plan 3, never alone. The release runbook is [`qa/chat-release/README.md`](../qa/chat-release/README.md). One line each; the plan holds the reasons.

**Decisions** (the plan's Decisions 1 to 14, as built).
- **CH-G1.** Any way back in clears a leave: a guest row inserted (a host's or a circle's invitation, a link, the roll), or moved to the person by a fold onto the current occurrence. Leaving revokes the leaver's personal links on the current occurrence, as removing a guest does, and their `invited` notice goes with the row, so an invitation back is told again, even the same week.
- **CH-G2.** The leave record is only the roll's skip list: a group's members are its hosts and the guest rows of its current occurrence. Someone who leaves after the current occurrence ended keeps that row, a real attendance, and is out of the chat at once; they can't be invited back until the roll. A leave from a closed group is allowed and writes its line.
- **CH-G3.** Two new lines: "Ana stopped repeating this · the last one is Thu 27 Nov" when Edit sets "Doesn't repeat", and "Ana made this a group · everyone invited can read this chat" when a one-off with messages starts to repeat. The spec has neither.
- **CH-G4.** A group stops when its owner can no longer use the app: the roll skips its plan, and its chat closes 48 hours after the last end.
- **CH-G5.** The roll drops a "brought by" that points outside the group: a carried guest whose bringer isn't carried reads as nobody's.
- **CH-G6.** On a group a reply flip changes one fact at a time: a can't-go line merges only into that person's can't-go line from the last 10 minutes on the current occurrence; a joined line is never rewritten; back to Going or Maybe within 10 minutes deletes the can't-go line (state `deleted`, so open screens drop it by the signal), and an older line or one from an earlier week stays.
- **CH-G7.** A group's open chat pushes in a cancelled week (P2-Q1): after "Cancel just this one", and for the 48 hours after "Cancel this and stop repeating" or a stop by Edit. A cancelled one-off still pushes nobody. Both mutes still apply.
- **CH-G8.** The When sheet's "The chat closes 48 hours after the end time." hides while Repeats is "Every week" or "Every 2 weeks" (P2-Q2), and shows as built otherwise. No new words.
- **CH-G9.** A group member who hasn't answered keeps both the Chat row and the announcement line on the resbite page (P2-Q3).
- **CH-G10.** No server field names a group's current occurrence (P2-Q4): My resbites' unread dot can sit on an older tile until the list refreshes.
- **CH-G11.** A member who hasn't answered reads no exact place in the chat: `private.chat_row` leaves `place_label` out of a "Next one" or place-change line for a reader who is neither a host nor a guest who has answered on the current occurrence, as the resbite page shows them only the area (owner question G-QA's default). The plan row's `place_label` stays readable to them through `plan_read`, as since GI1.
- **CH-G12.** Turning the repeat back on deletes the latest "stopped repeating" line still sent, by state, and nobody is told it resumed (owner question G-QB's default).
- **CH-G13.** The roll depends on CO-Q1 staying "carried" (owner question G-QC): every repeating resbite is a group, so not carrying a brought person who said Can't go would take them out of the group's chat at the roll.
- **CH-G14.** Every "Next one" line, old or new, opens the summary's current occurrence, the newest the reader may read, never the line's own plan; with no current occurrence to open, the tap reads the chat again and stays on it.

**Owner questions** (recorded in the runbook's step 0; the build ships the defaults and doesn't wait for the answers).
- **G-QA, the place in a group's chat lines.** Default: hidden from members who haven't answered, server-side (CH-G11). The alternative, the place for every member (the spec's wording), is one condition in `private.chat_row`.
- **G-QB, resuming a stopped group.** Default: the "stopped repeating" line is removed, with no new words (CH-G12). The alternative, a line such as "Ana set this to repeat again", needs approved wording.
- **G-QC, the circles runbook's CO-Q1, still open there.** Default: a brought person who said Can't go is carried, as built (CH-G13). The alternative changes the circles roll before its migration, and this plan's copy of it is re-based on the new body and hash.
- **G-QD, "this Thursday" on a fortnightly group** (ruling GR6 M9). Default: unchanged, the spec's wording on every group, though on a group that repeats every 2 weeks the current occurrence can be up to 13 days ahead. The alternative, the date, is app wording only.

*The group's words.*
- **CH-G15.** The lines: "Sol can’t make it this week", "Sol left the group", "Board game night ended", "Next one: Thu 20 Nov · Ana's flat" ("Next one: Thu 20 Nov" without a place, "· Place to be decided" when it is), "Ana cancelled this Thursday", "Ana cancelled the group", and CH-G3's two. A line's day never shows a year.
- **CH-G16.** The chat screen on a group: the header "Every Thursday · 9 in the group", and "Last one · Thu 27 Nov · 9 in the group" once it stopped, whatever this week's status, wrapping whole at any text size; above the field "To: everyone in the group, now and later"; Announce starts on "Everyone in the group · 9", then "Going this Thursday · 6", with "Write an update for the group"; cards read "ANNOUNCEMENT · TO EVERYONE IN THE GROUP" or "… TO GOING THIS THURSDAY"; the owner alone reads "Nobody’s going yet" with "Messages here reach everyone in the group."; the menu says "People in this group · 9"; the closed card "This group’s chat closed on Thu 27 Nov.".
- **CH-G17.** Leave: "Leave group" in red after Mute in the chat's menu, and "Leave this group" last in the resbite page's More, for a member who isn't a host while the chat is open, on any page of the series, a member who hasn't answered included. Both ask in place "Leave Board game night? You’ll stop getting its Thursdays and its chat." (with no day to name, "…its invitations and its chat."), with a red "Leave group" and Keep. It lands on My resbites; a failure stays in the question with its reason and can be tapped again. The resbite page's Chat row reads "Group chat".
- **CH-G18.** "Next one" is a button with the hint "Opens the resbite", drawn as the change chip. A group member who hasn't answered gets the unread dot on their invitation card on My resbites.

*Calls made while building* (rulings GR1 to GR3; they change what the plan describes).
- **CH-G19.** Rows carry the occurrence they belong to (`plan_id`); an announcement from an earlier occurrence loses "this Thursday" and reads as a one-off's going audience, so last week's never reads as sent to next week's people (GR1). A row without `plan_id` reads as the current week's.
- **CH-G20.** The group flag's trigger takes a chat row only where it writes it, so a one-off's chat row is never locked by a cancel, and the lock order is written in the migration (GR2). `series_is_group` is false for anyone who may not use the app. A fold clears a leave only when the row lands on the current occurrence.
- **CH-G21.** Leaving also revokes live personal links to the leaver's confirmed phone number and drops their admin row, as removing a guest does; it checks membership before it locks any plan. A member asks someone who hasn't answered through the group only while that person is a current member (GR3).
- **CH-G22.** The roll never resumes a closed group, even after its owner can use the app again. The app's Edit can't reopen an ended occurrence, so the way back for a closed group is the closed card's "Do this again", a new resbite (GR3 Q1).
- **CH-G23.** The roll sets the roll flag itself, so it writes no "joined" or "admin" line for anyone it carries, and writes "ended" and "Next one" through the line writer. It takes its plans in series order, so two runs, or a run and a deletion, never wait on each other's chat rows; an ineligible owner's current occurrences are taken skip-locked.
- **CH-G24.** A group's pinned announcement, and the announcement under an invitation on My resbites and the resbite page, are only the current occurrence's, so last week's never heads next week's chat or invitation (ruling GR4).
- **CH-G25.** Leaving goes one way from both screens (ruling GR5): it syncs the phone's reminders, counts `leave_series`' 42501 'Not in this group' after the person's own attempt as done, drops every occurrence of the group from My resbites at once (until a list read started at or after the leave succeeds), and lands on My resbites while the group's chat or resbite page is in focus, even after Back during the leave.
- **CH-G26.** A group's cancelled and can't-go lines say "this Thursday" or "this week" only on the current occurrence's rows; an earlier week's cancel names that week's date, "Ana cancelled Thu 20 Nov", never "the resbite", which in a group reads as the whole group ending, and an earlier week's can't-go reads in the one-off words (rulings GR1, GR6, GR7). An invitation card's unread dot is a group member's only: a one-off admin who hasn't answered gains none. The resbite page shows without waiting for `series_is_group` and turns into the group's when it answers. A leave's follow-up (reminders, My resbites, landing) is the account's that started it, finishes after a lost answer when the chat then refuses its reader, and lands from the group's chat, resbite page or people list, even when the page's own read failed (ruling GR6).

## Chat safety (CH), 12 November 2026

Chat plan 3 of 3 ([plan](../docs/superpowers/plans/2026-11-11-chat-3-safety.md)) adds report and block, the chat rules, the blocked terms and the Resbite team's side, which App Store guideline 1.2 asks of a chat. It is built on branch `ch3-safety`, stacked on chat groups, and is not rolled out. Its migration is `20261111160000_chat_safety.sql`. It goes live in the same sitting as chat core and plan 2, never alone, and no chat reaches testers or App Review without it. The release runbook is [`qa/chat-release/README.md`](../qa/chat-release/README.md), with the App Store review notes beside it. One line each; the plan holds the reasons.

**Decisions** (the plan's Decisions 1 to 18, as built).
- **CH-S1.** Unblocking exists, from the person's sheet ("Unblock Leo") and from Profile → Data & privacy → Blocked people, so a block made by mistake is undone wherever the two last met.
- **CH-S2.** A block reads as a refusal: the blocker asking the blocked person is told "Unblock this person first."; the blocked person asking the blocker sees "Request sent" and leaves a visible refusal, as "Not now" does. Both checks come before every accept path, after the two visibility refusals (CH-R-A1).
- **CH-S3.** The chat menu's "Report or block" opens a sheet of the chat's people, each opening that person's sheet; it is hidden when nobody else is in the chat. A name over someone else's message opens the same sheet.
- **CH-S4.** A report's reasons are Harassment · Spam · Not appropriate · Something else, with an optional line of up to 500 characters.
- **CH-S5.** A join requester can be blocked, not reported: they are not on the resbite.
- **CH-S6.** One report per person per message, and one open report per person about a person on a series; a repeat answers the same thanks and stores nothing.
- **CH-S7.** Deleting an account deletes the reports it filed and its blocks both ways, however the account goes (the deletion step, and the cascade from a profile removed by hand). Reports about a person keep the frozen words and the person's id until closed; a closed report is deleted 180 days after closing (R-Q3).
- **CH-S8.** The chat rules come before a first message or announcement: a one-time sheet, stored per person and version `2026-11`. The Terms document and `TERMS_VERSION` stay the owner's.
- **CH-S9.** A blocked-terms list stops a message or announcement before it is stored: whole words, in any case, a space matching any run of blanks or a line break. Nothing is seeded; the owner fills the list, and the release waits for it.
- **CH-S10.** Each new report pushes the moderators "A new report is waiting.", with no content; its tap opens nothing. Neither the reporter nor the reported person is pushed for it.
- **CH-S11.** A blocked person can't reach the blocker by invitation in the app (G-S13's default): their `invited` notice is not eligible, and the blocker's number reads to them as one not on Resbite, in the contact lookup too.
- **CH-S12.** A host who blocks is told what they give up: they won't see the person's messages or be able to remove them. There is no collapsed row for a blocked person's messages.
- **CH-S13.** Reporting and blocking work on a closed chat, as Delete and Remove do (K-S17's default): reporting is not writing.
- **CH-S14.** On an invitation not yet answered, the card and the resbite page offer Report message for its announcement, and Report and Block for the announcer, the person who invited them and the owner, with or without an announcement (P3-Q1, R-Q1). They report people, not the resbite, so "Report this resbite" (CR-D11) stays out of this build.
- **CH-S15.** A block reaches the team without a push: the daily read (`open-reports.sql`) lists the last 7 days' blocks beside the open reports, who blocked whom and when, never message text (R-Q2).
- **CH-S16.** Reports have limits: at most 20 per account per 24 hours ("You’ve sent a lot of reports today. Try again later."), and at most one push per moderator per 10 minutes. Report pushes go ahead of chat pushes.
- **CH-S17.** A block or unblock made anywhere refreshes every open chat on that phone at once, through one app-wide event. Another phone signed in to the account learns of it at its next full read.
- **CH-S18.** A blocked person's pushes stop, join requests included, and no push names someone the recipient blocked: a host who blocked Leo reads "Clara is going." without "brought by Leo". The resbite's own news (a change, a cancellation, a group's "<title> is on again") still arrives, and a blocked person's join request still shows to every host, who can decline it (R-Q5).

**Owner questions** (recorded in the runbook's step 0; the build ships the defaults, and the release waits where a line says so).
- **The support address.** Default: none, and the release waits (steps 5b and 6a). The app shows no contact line while it is unset or not an address.
- **Who moderates.** Default: the owner alone. Another moderator can read and act on reports only in the hosted project's SQL editor, with the queue's scripts.
- **The blocked terms.** Default: none seeded, and the release waits for the owner's list (step 5a's gate).
- **The chat rules' wording and the Terms document.** Default: the rulings' wording ("Be kind. No harassment, hate, threats or spam. …"), version `2026-11`, and the Terms document unchanged.
- **G-S13, invitations from a blocked person.** Default: they never reach the blocker in the app (CH-S11).
- **R-Q1, Report from an invitation.** Default: Report the person wherever Block is on an invitation (CH-S14).
- **R-Q2, a block reaching the team.** Default: listed in the daily read, with no push (CH-S15).
- **R-Q3, how long a closed report is kept.** Default: 180 days after it is closed (`private.report_keep_days()`).
- **R-Q4, who answers within 24 hours when the owner is away.** Release-blocking: the owner names a backup reader before the release, and until then reads the queue alone, daily.
- **R-Q5, a blocked person's join requests.** Default: no push of any kind from a blocked person to the blocker, join requests included (CH-S18).
- **R-Q6, what a host's block does.** Default: it hides the person's messages from that host only, and the host's confirm says "This hides their messages from you only. To stop them for everyone, remove them from the resbite." (ruling SR1).
- **R-Q7, what Data & privacy says of blocks.** Default: "Blocks stay until you undo them. The Resbite team can see who blocked whom for 7 days." (ruling SR4).

*Calls made while planning and building* (rulings SR1 to SR9; they change what the plan or the spec describes).
- **CH-S19.** A message the team removes keeps its row, `removed`, with `payload {"by": "resbite"}`, and reads "Message removed by Resbite"; a host's removal still reads "Message removed by an admin" (CH-R-A3).
- **CH-S20.** `block_user` refuses a call missing whom or which (`22023 'Invalid block'`) and answers `stored`, true only when the caller's block exists afterwards. The app shows a block only on true, and a block that stored nothing closes its confirm without a word, so nothing tells the blocker that the other person can no longer be read (SR1, SR8, SR9).
- **CH-S21.** A repeat block of someone the caller can no longer read answers `stored` false though the earlier block stays; harmless, since the app takes blocks from `my_blocks` (SR8's re-review).
- **CH-S22.** A refused report says only `23514 'Invalid report'`, with no detail, so no stored row reaches the caller or the log; the sweep of the three chat migrations found no other function echoing someone else's row (SR3).
- **CH-S23.** Writers take rows in one order: a report takes its plan's row first; the deletion and the fold take guest rows, then blocks, then reports; the rollback takes the outbox last. A rollback that still meets a claim, a chat being opened or a block being made stops with nothing changed and is run again (SR3, SR5).
- **CH-S24.** A suspension is recorded by the suspended account (`private.suspensions`), so its undo outlives the report and the reporter's account, and puts back only what that suspension changed, never an earlier ban (SR3, SR8).
- **CH-S25.** The team's scripts close only an open report, print no blocked term even for a refused list, and print a removed message's final state (SR3, SR8).
- **CH-S26.** `my_blocks` gives each block's time, and Blocked people shows "Blocked <day>" under each name, so two people with one first name are told apart; a long name wraps, an unblock is announced and moves focus, and Copied shows only once the copy went through (SR4, SR7).
- **CH-S27.** While a phone's blocks are unknown, no row offers Block, Unblock or Connect (N13); a failed read keeps them unknown and says nothing, and a block the server confirmed stays known even if the read after it fails (SR2, SR6).
- **CH-S28.** Focus follows every report and block step and returns to the menu row after Keep; a message removed while its report sheet is open keeps the sheet and the typed words, with "You can’t report that any more." (SR6).
- **CH-S29.** `report_user` admits an announcer only through a sent announcement, as `block_user` does, and a fold drops the reports between the two accounts it merges (Task 2).
- **CH-S30.** A chat's person sheet offers Report and Block or Unblock, not Connect, which stays on People in this chat; Report and Block come last in a person's actions, and one's own announcement offers no Report message (Tasks 4 and 5).
