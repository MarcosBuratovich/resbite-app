# UI audit and refinement — 17 September 2026

Scope: visual hierarchy and existing MVP interactions. Tester access remains closed.

## Findings

- Profile mixed saving, settings navigation, photo actions and leaving the app into a long stack of similarly weighted rounded buttons.
- Plan cards used four full-width buttons, giving editing and cancellation as much weight as inviting.
- People selection combined large headings, repeated outlines and equally prominent secondary controls.
- Category filters relied on text pills; wellness summaries had little iconography.
- Shared spacing and heading line heights made short secondary labels unnecessarily tall.

## Changes

- Pinned gluestack core 5.0.15 and utils 5.0.6. Shared buttons, navigation rows and text actions use its button creator; contact selection uses its checkbox creator. Headless primitives are themed with the existing React Native styles; no additional styling engine or native module is required.
- Added reusable card groups, icon rows and quiet text actions. Aqua, rose, violet and amber icon badges distinguish destinations while text labels remain visible.
- Profile separates the editable profile card from grouped settings/exploration cards. Save is the single filled action within the form.
- Plan cards use compact edit/people rows and a quiet, clearly labelled cancellation action, preserving confirmation. Added calendar and place icons.
- People/groups use tighter selection rows, grouped contact access actions and a compact manual-entry card. Permission and explicit selection behavior are unchanged.
- Discover uses icon category tiles, activity illustrations and lighter card typography. Wellness categories use coloured icon cards and retain sample labels.
- Invitation management and RSVP use icon rows and quieter revoke/withdraw actions. Existing recovery and disabled-state guards are retained.
- Shared buttons and fields have smaller corner radii. Warm page backgrounds make white cards distinct. Type remains scalable; controls grow with content and keep touch targets of at least 44 points.

## Verification

- TypeScript and the existing 55 tests pass; content manifest passes.
- All seven existing browser flows pass with intercepted backend requests. People QA clicks the checkbox's visible label, reflecting gluestack's hidden native HTML input. The new UI review also verifies keyboard selection.
- Screenshots reviewed at widths 320 and 390; no browser console/page errors. Repeat with `node scripts/review-ui.mjs` while local Expo runs. Screenshots default to `/private/tmp/resbite-ui-audit` (override `RESBITE_QA_SHOTS`).
- iOS Hermes export passes. Fresh app launch on the connected iPhone succeeded. Native visual review, Larger Text and VoiceOver for the revised controls remain pending owner verification.
- No live backend changes, invitations or contact uploads. React Native Paper was permitted as an option; only gluestack was needed for this pass.

## Depth and button colour follow-up

Owner approved the compact direction, then requested more depth and removal of the green/dark-text button treatment. Primary actions now use the existing brand pink with regular-weight ink labels, a 26-point radius, a pale edge and a soft rose shadow. Secondary buttons are white with a lilac edge. Pressed buttons reduce their shadow; disabled/loading buttons have no shadow. White cards, activity cards and icon badges use restrained warm shadows through shared depth tokens. Layout and business behavior are unchanged.

Measured text contrast: pink primary 6.91:1, pressed pink 6.20:1, white secondary 12.73:1 and pressed lilac 10.99:1. TypeScript, 320/390 visual/keyboard review and planning flow checks pass. Native appearance remains subject to owner review.
