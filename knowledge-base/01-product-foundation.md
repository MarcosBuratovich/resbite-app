# Resbite: product foundation

## Selected first-test scope

The owner selected manual sharing of real invitation links and notifications limited to invitations, RSVP and plan changes; search and categories; contact import plus reusable groups; optional profile photo; and owner cancellation without transfer. Attendance caps, waiting lists, extra filters, similar activities, suggestion forms and post-event extras are deferred.

Wellness and chat are **clearly labelled samples**; live messaging and real wellness calculations are not required for this test. The test is an English iPhone app for a small invited group. Success means the boss and another tester can discover an activity, create a plan and complete a real invitation/RSVP loop.

Before visual work, review brand inconsistencies (Q15 C). Before real-tester use, define minimum data, visibility, contact handling, deletion and retention (Q13 A). Those selections authorize preparatory work; they do not imply that it has already been completed. No deadline is set.

Accounts are required. The owner selected Google sign-in plus email/password registration with email confirmation. These methods apply to organizers and invitees; no guest RSVP. Email/password is an explicit owner addition, not inferred from the old phone-verification screens.


Latest owner selections: **iPhone app, Google sign-in plus email/password with email confirmation, real invitations and RSVP between testers, location, notifications and contact import, and 8–12 documented activities with suitable existing artwork**. Illustration generation is planned for future gaps. Accounts are required; use Google or email/password with email confirmation. Guest RSVP is excluded. Notifications are limited to invitations, RSVP and plan changes; detailed permission handling remains to define. See [selectable decisions](05-open-questions.md).

Audit date: 17 September 2026. This foundation describes the supplied evidence and the owner's decisions; it does not authorize additional features or claim the app is already built.

## Platform direction

The owner plans Android after the first iPhone test and selected Supabase as backend. The updated technical recommendation is React Native/Expo with TypeScript, preserving shared app logic and motion across both platforms. Android delivery is a later milestone.

## Immediate project objective — owner clarification

The immediate goal is a product the owner's boss can **view and test**, with limited time available. The agency created the concept and designs; the app was **never implemented**. This owner clarification supersedes uncertainty about an existing app repository.

A catalogue of 100 activities and multiple registration methods are **not required**. Illustrations for 100 activities do not exist in the supplied collection. Use a smaller selection and consider future artwork production through image generation or a suitable plugin. This is a content-production possibility, not an in-app feature.

The activity range and Google and confirmed-email/password registration are now selected; real invitations and RSVP between testers are selected. The [selectable questions](05-open-questions.md) distinguish owner decisions from recommendations. The documented product core below describes the broader MVP; it does not require every core capability to be fully implemented in the first demonstration.

## What Resbite is

Resbite is a private social app that helps people connect and socialise in person by discovering activities and arranging when, where, and with whom to do them. Its stated purpose is to strengthen real relationships and support wellbeing through real-world experiences. The app handles the preparation and coordination around those experiences. [S0913: website/index.html and product.html](sources.md#s0913), [S0183: explainer script](sources.md#s0183).

A **resbite** is an arranged instance of an activity. The source material also uses the same word for an activity idea in the catalogue. This distinction matters: “Painting” is an idea; painting with selected people at an agreed place and time is a planned resbite. This is an explanatory distinction inferred from the Discover and setup flows, not a prescribed database design. [S0677: F.1/F.5](sources.md#s0677), [S0684: K.1–K.12](sources.md#s0684).

## The problem the materials describe

The business argues that social technology can distract people from meaningful relationships and real-world experiences. Its response is to make it easier to decide what to do and coordinate getting together. The source materials frame health and happiness as intended outcomes; they do not establish that using Resbite produces a measured clinical benefit. The Keele report is a literature review of social media benefits and harms, not an evaluation of a deployed Resbite app. [S0913: index.html, research.html and embedded Keele report](sources.md#s0913).

## Who it is for

The recurring use cases involve friends, families, couples, workmates and households. The 2025 website snapshot also mentions reconnecting with old friends and expanding connections through friends-of-friends; that last statement is not accompanied by a complete MVP discovery/permission flow. [S0913: product.html](sources.md#s0913).

Older investor material describes a primary audience aged 30–50, with a female bias and children aged 12–20; the AWS deck uses a broader 20–55 market calculation. These are historical positioning statements, not verified current launch targeting. The market, supported languages, operating systems and minimum account age need confirmation. [S0893: p17](sources.md#s0893), [S0950: Market slide](sources.md#s0950).

Child subaccounts appear extensively in older designs and in the website roadmap. The later February 2025 MVP notes say “Child account not part of MTV.” This audit interprets “MTV” as a likely typo for MVP and defers child subaccounts from the first release. The interpretation is recorded rather than silently correcting the source. [S0945: G artboard](sources.md#s0945).

## The essential experience

1. Discover an activity and read what it involves.
2. Arrange the activity: choose a time and place and invite people.
3. Review the plan and share the invitation.
4. See planned resbites and coordinate with attendees through the resbite chat.
5. Review time spent on activities through wellness information.

These capabilities recur in the product page, wireflows and prototypes. The exact invitation order and identity model are not settled: the 2025 MVP notes favour manual invitations and ask whether invitees can join as guests. Google or email/password with email confirmation is now selected for organizers and invitees (owner D17); guest RSVP remains excluded. [S0913: product.html](sources.md#s0913), [S0945: K/I notes](sources.md#s0945), [S0619](sources.md#s0619).

## Product boundaries

The newer website's design ethics specify a private network, no publicly visible personal data, no selling user data or targeting ads, no in-app ads, no virtual rewards, and notifications only when essential to usability. The explainer additionally excludes photo tagging, like buttons, wall posts and public profiles. These statements supersede older reward/challenge concepts and a wireflow suggestion to sell featured placement. [S0913: index.html](sources.md#s0913), [S0183](sources.md#s0183), [S0639](sources.md#s0639), [S0677: F.1](sources.md#s0677).

The website's “no fake profiles” language is an aspiration; no complete identity verification mechanism was found. It must not be turned into an unsupported product guarantee. Guest attendance must be reconciled with this principle if chosen.

## Release boundary agreed with the owner

**MVP first. Premium and marketplace features remain separate.** This is an explicit owner decision made during this audit. It is stronger than older decks that present all features together.

The current foundation keeps activity discovery, planning, invitations, attendee coordination and wellness as the documented core. It records reduced-priority features and incomplete rules separately. “Documented” does not mean every screen should be built. Consult the [scope register](02-scope-register.md) before turning any item into implementation work.

Flexible invitation polls, photo collections, weather checker and guru stories belong to the later feature set. Hosted paid events, ticketing and the provider web portal belong to the marketplace stage. Dates such as “2025 launch,” “2026 v1” and “2027 v2” are source roadmap plans, not verified releases or new project deadlines. [S0913: product.html roadmap](sources.md#s0913).

## What the folder establishes about delivery

There is substantial design work: native Adobe XD files, screen exports, wireflows, activity illustrations and prototype recordings. A website source snapshot is present inside a ZIP. The sources refer to Flutter development, but no standalone mobile application codebase or backend implementation was located among the accessible files or listed archive members. The archive is evidence of product/design preparation, not proof of production readiness. [S0913](sources.md#s0913), [S0950](sources.md#s0950), [file inventory](audit/inventory.json).

The owner has since confirmed that the app was never implemented. Next, select the demonstration approach and derive a bounded brief from the existing journeys. No existing implementation, launch date or full launch scope should be assumed.
