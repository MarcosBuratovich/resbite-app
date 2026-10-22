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

Each GI2 database migration needs the owner’s explicit approval, by file name and sha256. The hosted migration goes live together with build 10 and the `delete-account` redeploy; the companion waits for the deletion lifecycle and the notification sender.
