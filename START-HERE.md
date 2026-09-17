# Resbite — project foundation

Resbite is a private social app for finding real-world activities, arranging them with people you know, and reflecting on time spent together. This knowledge base consolidates the supplied archive into a bounded starting point for the new project.

**Scope decisions:** newer substantive information wins when sources conflict; **MVP first**, with premium and marketplace capabilities kept separate. A feature appearing in an old screen does not automatically put it into the first release.

## Current objective

Give the owner's boss a focused product to view and test. The agency created the concept but **never implemented the app**. There is no requirement for 100 activities or multiple registration methods. A smaller catalogue is allowed, with missing illustrations considered as future content work.

Selected: **iPhone app, Google sign-in plus email/password with email confirmation, real invitations and RSVP, location, notifications, contact import, and 8–12 documented activities with existing artwork**. Use the [selectable questions](knowledge-base/05-open-questions.md) for recorded selections. Unselected recommendations remain proposals; public-launch questions can wait.

## Selected first-test scope

The owner selected manual sharing of real invitation links and notifications limited to invitations, RSVP and plan changes; search and categories; contact import plus reusable groups; optional profile photo; and owner cancellation without transfer. Attendance caps, waiting lists, extra filters, similar activities, suggestion forms and post-event extras are deferred.

Wellness and chat are **clearly labelled samples**; live messaging and real wellness calculations are not required for this test. The test is an English iPhone app for a small invited group. Success means the boss and another tester can discover an activity, create a plan and complete a real invitation/RSVP loop.

Before visual work, review brand inconsistencies (Q15 C). Before real-tester use, define minimum data, visibility, contact handling, deletion and retention (Q13 A). Those selections authorize preparatory work; they do not imply that it has already been completed. No deadline is set.

Accounts are required. The owner selected Google sign-in plus email/password registration with email confirmation. These methods apply to organizers and invitees; no guest RSVP. Email/password is an explicit owner addition, not inferred from the old phone-verification screens.

## Motion is part of the build

The updated recommendation is **React Native with Expo and TypeScript**, with **Supabase** for authentication, PostgreSQL, storage and Edge Functions. This supports iPhone first and a future Android app. Microanimations, launch/splash transitions, loading and success/error feedback are required for the first test. See [motion and interface states](knowledge-base/12-motion-and-interface-states.md), including reduced-motion and device-performance checks.

## Development planning

The [first iPhone test development plan](docs/superpowers/plans/2026-09-17-resbite-first-test.md) is ready for review. It includes screen flows, a proposed technical approach, milestones, setup dependencies and verification. A Mac and Apple Developer membership are available; no deadline is set.

- [First-test specification](docs/superpowers/specs/2026-09-17-resbite-first-test.md): selected scope versus proposed operating/data rules.
- [Brand and content readiness](knowledge-base/10-brand-and-content-readiness.md): reviewed inconsistencies and six artwork candidates; at least two more complete pairs must be verified before importing the 8–12-item catalogue.
- [Two-phone acceptance script](knowledge-base/11-first-test-acceptance.md): what must work before the boss tests it.

No app code or cloud resources were created during planning. Review the proposed architecture and rules before implementation.

## Read in this order

1. [Product foundation](knowledge-base/01-product-foundation.md) — what Resbite is, who it serves and its documented principles.
2. [Feature scope register](knowledge-base/02-scope-register.md) — 58 documented capabilities/concepts, each with evidence and a status. Twelve core outcomes; unresolved details are explicitly marked.
3. [User journeys and rules](knowledge-base/03-user-journeys-and-rules.md) — what the core experience does and where inherited rules conflict.
4. [Source precedence](knowledge-base/04-source-precedence.md) — chronology, newer MVP cuts and the limits of unfinished pitch decks.
5. [Open questions](knowledge-base/05-open-questions.md) — decisions and missing materials needed before defining the first build.

## Supporting material

- [Brand, assets and content](knowledge-base/06-brand-assets-and-content.md): reusable material, inconsistencies and missing launch content.
- [Audit report](knowledge-base/07-audit-report.md): findings across product, design, business, research, media and archives, including review limitations.
- [Decision log](knowledge-base/08-decisions.md): owner decisions separated from audit interpretations.
- [Workspace guide](knowledge-base/09-workspace-guide.md): folder structure, file moves and maintenance.
- [Source catalogue](knowledge-base/sources.md): direct links to every original file, with stable source IDs.
- [Exact duplicates](knowledge-base/audit/duplicates.md): retained copies and their locations.

## How to use this foundation

Start with the core outcomes in the scope register. Treat “Decision needed” items as unresolved and later/deferred items as outside the mandatory MVP. Record answers in the decision log and update the matching scope IDs and journeys together. Google and email/password with email confirmation are the selected sign-in methods. No implementation stack, launch commitment or pricing has been selected.

The latest substantive MVP notes reduce child accounts, favourites, additional admins and several supporting flows. They also raise alternatives for guest invitations and sign-in. Those alternatives require a decision; they are not automatically approved.

All **1,070 original files were preserved**, with a reversible move map and content hashes. The collection includes 158 extra exact copies, which remain in place. Sources now live under `source-materials/`; filenames inside native project trees were preserved.

This is a source-backed discovery foundation, not a claim that every native layer or recording has been fully reviewed. The encrypted deck remains unreadable; audio has not been completely transcribed; native editing/link completeness remains unverified. See the audit report for exact coverage and the questions list for the remaining information needed.
