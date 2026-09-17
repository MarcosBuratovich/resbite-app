# Brand and content readiness for the first test

Prepared during development planning. This fulfils the requested review of the known inconsistencies; the proposed resolutions below still need the screen review before visual implementation. Original source files remain unchanged.

## Brand review and proposed resolution

| Finding | Evidence | Proposed first-test treatment |
|---|---|---|
| Most complete guide is older than incomplete v07 | S0102 vs S0103 | Use complete v06 brand assets and styled V1.9 app references, with V3 controlling feature scope; do not treat v07 placeholders as specifications |
| Montserrat versus Quicksand versus incidental fonts | S0102 content typography; S0619 text; bundled fonts | Montserrat for custom content/headings, native system text for system controls; preserve original wordmark rather than recreating it with a font |
| Aqua colour codes repeated under unrelated swatches | S0102 pp10–11, 19–21 | Retain unambiguous aqua #89CAC7, cream #FAF5F0, pink #F2ADB2 and purple #BFB5BF as reference colours; derive missing role colours from inspected masters, not erroneous labels |
| #59A6A6 and #59A8A8 conflict | S0102 | Use #59A6A6 as proposed supporting aqua; verify against actual selected components before freezing tokens |
| Light palette may not support small-text contrast | Existing swatches | Use dark readable text and measure contrast on real components; aqua is not automatically suitable as text on white |
| iOS and Android component references coexist | Prototype family | Keep Resbite illustrations/shape language but use iPhone navigation, keyboard, permissions and system pickers |
| Small icon and main mark have different guidance | S0102 pp4–8 | Export existing icon artwork for app assets; do not force the large wordmark into the small icon |
| Sample text and benefit labels contain errors | S0618/S0689 | Correct visible copy in the new app, preserving source provenance; no invented health claims |

Suggested review output: one sheet containing welcome, activity card/detail, plan and invitation states, with the chosen typography, tokens and existing logo. Approve that sheet before styling all screens. This document is a review of evidence, not a new brand design.

## Artwork rechecked during planning

The following actual JPEG exports were visually inspected again. Their content supports six candidate activities; candidate names are editorial descriptions of the scenes, not approved final catalogue records.

| Candidate | Source | Actual visual evidence | Readiness limit |
|---|---|---|---|
| Tea / coffee together | [S0720](sources.md#s0720) | Three people sharing drinks and cake | Final title/description/category still need matching to product copy |
| Painting together | [S0721](sources.md#s0721) | Group at easels | Match to documented painting description; avoid copying its text into camping |
| Group exercise | [S0722](sources.md#s0722) | Four people doing standing exercise | Confirm the precise documented activity label; do not invent a new catalogue category |
| Cycling together | [S0723](sources.md#s0723) | Three people riding bicycles | Review tips and final display crop |
| Build a snowman | [S0724](sources.md#s0724) | Group building a snowman | Season-specific example; suitability for test audience needs content choice |
| Make a film together | [S0725](sources.md#s0725) | Camera, microphone and clapperboard | Confirm the corresponding activity copy |

The inspected JPEGs are small scene exports; do not assume they are adequate at all iPhone display sizes. Check source dimensions and locate vector/high-resolution counterparts within the S0719 family and related assets before export. No images were generated or edited during planning.

**Planning snapshot, superseded by the implementation update below:** The 8–12-item catalogue was not ready yet. Six clear scene candidates are identified, not eight complete records. Before the catalogue task, find at least two additional documented activity/artwork matches in the existing prototype/asset archive. Walking, camping, fishing and karaoke appear in product evidence, but their standalone reusable illustration matches have not been verified here. Do not count a screen screenshot, relabel an unrelated illustration or duplicate one activity just to reach eight. If fewer than eight suitable pairs survive review, return the concrete gap to the owner; the current decision is existing artwork first, generation later.

## Activity manifest required before import

For every selected item record: stable activity ID, approved English title, description, practical tips, source category label, optional suggested duration only when supported, source document/page, illustration source ID, export path, and review status. No invented benefit scores. Minimum eight and maximum twelve published records; incomplete candidates remain unpublished.

Proposed manifest locations at implementation time: `content/activities.json`, `content/asset-provenance.json` and `assets/activity-art/`. These are planned paths, not existing files.

## Copy and visual review checks

- Remove placeholders and cross-activity copy mistakes.
- Use “Resbite” for the app and “resbite” for an arranged plan; use plain “organizer” where roles need explanation.
- Distinguish “Invitation ready to share” from “Invitation delivered”; the share sheet does not prove delivery.
- Keep “Sample conversation” and “Sample wellness data” labels visible.
- Optional profile photo must remain skippable.
- Check narrow screens, larger text, contrast and VoiceOver labels on the proposed sheet.

This work reuses existing brand/product evidence and does not authorize an expanded catalogue or visual redesign.

## Implementation update — 17 September 2026

Eight documented activity/artwork pairs are now available in [the mobile manifest](../mobile/content/activities.json): Coffee together, Painting, Get out with bikes, Building a snowman, BBQ, Wine tasting, Spa day and Book Club. Original SVGs were rendered without new artwork to 1200px-wide PNGs. [Provenance](../mobile/content/asset-provenance.json) records exact originals and hashes. This resolves the earlier six-candidate artwork gap; it does not approve the drafted descriptions, tips or category assignments for publication.

The initial screens use Quicksand headings and Montserrat body text from the supplied font files, with existing palette references and a darker derived text aqua for readability. This is a review candidate, differing from the earlier proposed all-Montserrat headings. The current text wordmark treatment must also be reconciled with the original full wordmark before brand sign-off. No final brand approval is claimed. See [implementation status](../docs/implementation-status.md).
