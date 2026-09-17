# Decision log

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
