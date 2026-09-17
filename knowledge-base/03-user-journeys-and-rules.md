# User journeys and documented rules

## Selected first-test scope

The owner selected manual sharing of real invitation links and notifications limited to invitations, RSVP and plan changes; search and categories; contact import plus reusable groups; optional profile photo; and owner cancellation without transfer. Attendance caps, waiting lists, extra filters, similar activities, suggestion forms and post-event extras are deferred.

Wellness and chat are **clearly labelled samples**; live messaging and real wellness calculations are not required for this test. The test is an English iPhone app for a small invited group. Success means the boss and another tester can discover an activity, create a plan and complete a real invitation/RSVP loop.

Before visual work, review brand inconsistencies (Q15 C). Before real-tester use, define minimum data, visibility, contact handling, deletion and retention (Q13 A). Those selections authorize preparatory work; they do not imply that it has already been completed. No deadline is set.

Accounts are required. The owner selected Google sign-in plus email/password registration with email confirmation. These methods apply to organizers and invitees; no guest RSVP. Email/password is an explicit owner addition, not inferred from the old phone-verification screens.


Latest owner selections: **iPhone app, Google sign-in plus email/password with email confirmation, real invitations and RSVP between testers, location, notifications and contact import, and 8–12 documented activities with suitable existing artwork**. Illustration generation is planned for future gaps. Accounts are required; use Google or email/password with email confirmation. Guest RSVP is excluded. Notifications are limited to invitations, RSVP and plan changes; detailed permission handling remains to define. See [selectable decisions](05-open-questions.md).

Owner update: the first deliverable is for the boss to view and test. These are documented product journeys; invitations and RSVP must work between real testers; chat and wellness are selected as clearly labelled sample views. Do not treat historical registration alternatives as a requirement to implement multiple methods.

Read with the [scope register](02-scope-register.md). The descriptions below separate the core outcome from inherited detail. A detailed old screen is evidence, not automatic MVP authorization.

## 1. Access the app

Older baseline: introductory slides, phone number verification by SMS with a phone-call alternative, name, email verification, date of birth, profile photo, and location setup. Login repeats phone verification; recovery uses the associated email and then phone verification. [S0671](sources.md#s0671), [S0672: B](sources.md#s0672), [S0675: D](sources.md#s0675), [S0676: E](sources.md#s0676).

Newer changes: V3 considers Apple/Google sign-up; a “Not for MVP” annotation is positioned near the registration profile-photo screens. The latest note does not establish a replacement sign-up flow or which other fields remain mandatory. [S0945](sources.md#s0945), [annotation evidence](audit/v3-notes.json).

Selected: Google plus email/password registration with email confirmation. Unresolved: required fields; account age; recovery by link versus code; whether activity browsing requires login. The prototype places date of birth earlier than the older board. Do not reproduce every step from both versions.

## 2. Discover an activity

Discover contains activity cards, categories, search and activity detail. Detail provides a description, duration, tips and a way to start arranging the activity. The sources illustrate painting, coffee together, walking, camping, fishing, karaoke and other activities; these are examples, not a complete verified launch catalogue. [S0677: F.1/F.5](sources.md#s0677), [S0618: activity detail screens](sources.md#s0618).

The historical search matches titles and associated tags, displays recent searches, handles no results, and can lead to a suggestion form with title and description. The suggestion is submitted for consideration; the sources do not describe automatic public publication of a user's newly invented activity. [S0677: F10–F14.2](sources.md#s0677).

V3 explicitly prioritizes activities while reducing priority for favourites and the previously completed row. It questions the number of filters and similar-activity suggestions. Preserve basic discovery; do not inherit the full recommendation system or filter taxonomy without a decision. [S0945: F](sources.md#s0945).

## 3. Arrange and invite

The common information is: chosen activity, invitees, date/time, place, optional meeting note, and a final overview. The old wireflow orders the steps Invite → Schedule → Place; the styled prototype and website present time/place before invitations. V3 does not resolve this ordering. [S0684: K](sources.md#s0684), [S0619](sources.md#s0619), [S0913: product.html](sources.md#s0913).

The detailed location flow supports address/place search, autocomplete, map/list presentation, no results, recent places and saved places. It explicitly allows map search when location permission is denied, while disabling current-position functionality. This is a useful documented fallback; the chosen maps provider and the MVP's extent of place saving remain unsettled. [S0685: K-1](sources.md#s0685).

The historical schedule supports start/end times and multiple days. Another retained fragment in V3 says only day and starting time should be mandatory. No single validated rule covers required end time, time zones, multi-day duration or invalid/past dates. [S0684](sources.md#s0684), [S0945: retained setup fragments](sources.md#s0945).

Latest invitation direction: the user sends invitations manually. The sources support sharing links through other apps, but do not define whether “manual” means the system share sheet, copied links, selected SMS recipients or another delivery action. They also ask, without deciding, whether invitees can enter a name as guests. Do not silently design a guest website or promise automated SMS/email delivery. [S0945: I/K](sources.md#s0945), [S0673: C.2/C.8/C.9](sources.md#s0673).

## 4. Receive and respond

The old registered-user flow offers accept/decline, an optional decline message and an upcoming event view. Chat becomes visible after acceptance in the G wireflow; the newer website says chat with invitees or confirmed attendees. That is an access-rule conflict needing resolution. [S0678: G.5–G.9](sources.md#s0678), [S0913: product.html](sources.md#s0913).

A new guest flow, if selected, must answer how the recipient opens the invitation, proves control of their RSVP, changes their response, accesses chat, and is reflected in wellness. Those are missing rules for a documented option, not approved additional features.

## 5. Manage an upcoming resbite

The old baseline distinguishes an owner/admin from ordinary invitees. Admins can change time/place and invitees; invitees can view the plan and withdraw. The sources include cancellation and participant lists. V3 deprioritizes assigning other invitees as owners, and the owner now selected cancellation when the owner cannot attend, without transfer. [S0679: H.1/H.10–H.20](sources.md#s0679), [S0945: H note](sources.md#s0945).

Changing time/place historically notifies invitees. The S board also includes a resend-invitations button after modifications, whereas the H board describes automatic in-app updates and no resend button for invitees. With manual invitations now preferred, the exact update behaviour is unresolved. Do not silently combine all mechanisms. [S0679](sources.md#s0679), [S0688](sources.md#s0688), [S0945: I](sources.md#s0945).

## 6. Attendance limits, if retained

The S board describes first-to-confirm places, an optional waiting list and notifications when a place is released. It says the attendance limit must be at least one-third of the invitee count, but a later note says warn when invitees reach two-thirds of the attendance limit. Those cannot both describe the same upper bound. Example screens also show four places, ten waiting and nineteen unconfirmed, conflicting with the earlier stated waiting-list bound. [S0688: S/K.1.2/K.1.3](sources.md#s0688).

A waiting list can be reordered by the admin, while notifications appear to go to waiting users when space opens. Priority, reservation, simultaneous acceptance, rounding and whether the owner counts are not defined. Do not invent allocation rules. The owner selected deferring caps and waiting lists from the first test; these historical rules are not implementation requirements.

## 7. Chat and completion

The historical chat is tied to one resbite, with text messages, system event messages and conversation search. It closes three days after the resbite ends; the source shows a countdown and then a closed state. “Closed” does not establish deletion of stored messages. [S0679: H.7–H.9](sources.md#s0679), [S0686: L.6–L.9](sources.md#s0686).

V3 marks the after-resbite area “Not a priority,” near the feedback flow. The note's exact extent is unclear. The older repeat flow preserves place/invitees but requires a new date, and feedback asks how the activity made the user feel. These should remain reduced-priority candidates; retain the distinction between completed activity data needed for wellness and optional post-event UI. [S0945: L](sources.md#s0945), [S0686: L.1–L.10](sources.md#s0686).

## 8. Wellness

The T board shows activity time, seven categories—Creative, Intellectual (spelled “Intelectual” in sources), Mindful, Natural, Physical, Community and Uplifting—plus connections, places and comparative views. It says an activity can have one or two key benefits. The dashboard supports different time periods; one note uses monthly rather than weekly summaries for infrequent use. [S0689: T.1/T.2](sources.md#s0689).

The 2025 website retains wellness in v0 and additionally describes virtual-social versus real-social time and relationship quality. No measurement method for outside-app screen time or a validated relationship-quality score was found. MVP wellness can only be specified fully once its input data, duration counting, category allocation and visibility are agreed. The displayed percentages are mock data, not approved formulas. [S0913: product.html](sources.md#s0913).

Child views belong to the deferred child subsystem. User/household/all-user comparisons need an explicit privacy/aggregation rule; “Only you can see this data” cannot by itself define what is visible about other people. [S0689](sources.md#s0689), [S0945: G](sources.md#s0945).

## Terms and information already implied by the flows

| Term | Meaning in the supplied materials | Scope note |
|---|---|---|
| Activity idea | Catalogue entry with name, description, duration, tags/benefits and illustration | Core; catalogue completeness unknown |
| Planned resbite | Activity arranged for people at a time/place, with a lifecycle and chat | Core |
| Owner | Person arranging a resbite | Owner cancels if unable to attend; no transfer |
| Additional admin | Invitee granted management rights | Deprioritized by V3 |
| Invitee / attendee | Person invited / person who has accepted | Accounts required; Google or confirmed-email/password registration; no guest RSVP |
| Connection | An accepted relationship between users | Core social concept; importing/classifying contacts deprioritized |
| Group / Household | Reusable collections of connections; Household is a special built-in group in old flows | Reusable groups selected; special Household rules not selected |
| Child subaccount | Parent-managed participation/history under older age thresholds | Deferred by V3 |
| Wellness category | A label for the kinds of benefit associated with activities | Core direction; scoring unconfirmed |
| Hosted resbite | Provider-created paid event | Marketplace, outside MVP |

This table is a vocabulary guide, not a backend schema or a commitment to create every listed entity.
