# Brand, assets and content audit

## Selected first-test scope

The owner selected manual sharing of real invitation links and notifications limited to invitations, RSVP and plan changes; search and categories; contact import plus reusable groups; optional profile photo; and owner cancellation without transfer. Attendance caps, waiting lists, extra filters, similar activities, suggestion forms and post-event extras are deferred.

Wellness and chat are **clearly labelled samples**; live messaging and real wellness calculations are not required for this test. The test is an English iPhone app for a small invited group. Success means the boss and another tester can discover an activity, create a plan and complete a real invitation/RSVP loop.

Before visual work, review brand inconsistencies (Q15 C). Before real-tester use, define minimum data, visibility, contact handling, deletion and retention (Q13 A). Those selections authorize preparatory work; they do not imply that it has already been completed. No deadline is set.

Accounts are required. The owner selected Google sign-in plus email/password registration with email confirmation. These methods apply to organizers and invitees; no guest RSVP. Email/password is an explicit owner addition, not inferred from the old phone-verification screens.


Latest owner selections: **iPhone app, Google sign-in plus email/password with email confirmation, real invitations and RSVP between testers, location, notifications and contact import, and 8–12 documented activities with suitable existing artwork**. Illustration generation is planned for future gaps. Accounts are required; use Google or email/password with email confirmation. Guest RSVP is excluded. Notifications are limited to invitations, RSVP and plan changes; detailed permission handling remains to define. See [selectable decisions](05-open-questions.md).

## Existing visual direction

The reviewed assets consistently use aqua/turquoise, purple, soft supporting colours, rounded controls and illustrated people participating in real-world activities. The mark resembles a rounded triangular slice with radiating lines. Lifestyle scenes contrast isolated device use with people being together. This is existing work to reuse, not a proposal to redesign the brand. [S0102](sources.md#s0102), [S0619](sources.md#s0619), [S0719–S0725](sources.md#s0719).

### Typography

The usable v06 brand guide specifies Montserrat for content; the archive also labels Quicksand as a main brand font. Native prototype V1.9 text predominantly uses Montserrat, with Roboto and several other fonts in components/reference elements. Do not treat every font found in a mockup as a brand font. The approved UI typography should be selected from the actual brand/prototype evidence. Font files and Open Font License texts are retained together. [S0102: p9](sources.md#s0102), [S0619](sources.md#s0619), [font assets in catalogue](sources.md).

### Colours

The v06 guide states a main aqua-green of `#89cac7`, supporting shades `#59a6a6`, `#6ebfbd`, `#a8ded9`, `#b5ebe3`, `#d9faf5`, and supporting colours including cream `#faf5f0`, pink `#f2adb2` and purple `#bfb5bf`. It also repeatedly assigns the same aqua code to labels such as yellow, purple, skin tones and strokes. Those entries visibly conflict with their swatches and cannot be copied into a final token system without checking the master artwork. Another background page uses `#59a8a8` instead of `#59a6a6`. [S0102: pp10–11, 19–21](sources.md#s0102).

The newer v07 XD guide is not a completed replacement: it contains placeholders, unfinished numbering and sections copied from pitch content. Its newer date cannot supply missing colour, typography or component decisions. [S0103](sources.md#s0103).

### Logo and icon constraints already documented

The guide distinguishes the main mark from small-size app icons, recommends the main graphic mark at no less than 100px, and provides icon alternatives for smaller sizes. It also warns against altering the app icon's proportions/rounded corners and generally pairs the wordmark with the mark. These are historical brand instructions to check against approved masters, not platform export specifications. [S0102: pp4–8](sources.md#s0102).

## What is available

| Asset family | Supplied material | Reuse status |
|---|---|---|
| App visual reference | Styled V1.8/V1.9 XD prototypes, 85-page V1.9 PDF export and four prototype recordings | Strong visual reference; later MVP annotations still control scope |
| App logic | Master XD wireflows, general and individual flowcharts, developer PDFs | Rich but mixed-generation; preserve screen IDs and annotations |
| Brand | Guides, Illustrator masters, mark variations, fonts, backgrounds and social templates | Useful existing direction; guide errors and approval status noted above |
| Activity illustrations | Painting, meals, walking, bikes, snowman, outdoors and social scenes | Examples for catalogue use; not evidence of a full 100+ activity dataset |
| Animation | Illustrator scene layers, storyboards, After Effects projects, video exports, voice takes and subtitles | Keep each source project with its footage; latest final delivery needs owner confirmation |
| Lottie assets | `Lottie.rar` containing 23 JSON exports plus a directory entry | Located and indexed; native animation playback not tested |
| Website | HTML/CSS/JS/PHP snapshot in dated ZIP; pages, feature illustrations and research report | Website source, not mobile application code |
| Investor material | Multiple decks, one-pagers, reports, diagrams and native design files | Business context; many drafts/obsolete figures |

## Specific quality findings

1. **Placeholder content persists in high-version files.** The 13.1 PDF, presentation v14, brand v07 and some prototype details include dummy copy. The V1.9 camping example still contains painting text. Do not use these as final editorial content. [S1069](sources.md#s1069), [S0896](sources.md#s0896), [S0103](sources.md#s0103), [S0618](sources.md#s0618).
2. **Wellness labels are not consistent.** Categories/benefits change across designs; some activity assignments and demo percentages conflict. “Intelectual” and several other misspellings recur. Normalize approved labels in the future implementation brief, not in the historical source files. [S0689](sources.md#s0689).
3. **Terminology changes.** The earliest concepts say “Resbyte”; later material uses “Resbite.” “Resbiter,” “resbiteer,” “owner” and “admin” vary. Use Resbite for the product and lower-case resbite for an arranged activity; keep the original filenames as historical evidence inside archives.
4. **Platform and component references are mixed.** iOS-style screens coexist with Material components and Android references. The files do not establish a selected implementation stack or validated modern platform behaviour.
5. **All 70 distinct SVG files parse successfully.** One references two external PNGs; both exist in its local asset folder. This only verifies XML parsing and those explicit references, not every Illustrator/InDesign dependency. [SVG checks](audit/svg-checks.json).
6. **Marketing/reference artwork is mixed with reusable assets.** Stock-chart previews, media screenshots, sample profile photos and third-party marks are present. A folder's possession of an image does not establish its reuse licence. Keep their purpose distinct from approved Resbite production illustrations.
7. **Native editability is not fully verified.** InDesign, After Effects and Photoshop files were catalogued, but their layers, linked resources, fonts and editable project behaviour were not opened in the original authoring applications. No source was flattened or rewritten.

## Content still needed for implementation

- The approved catalogue: stable activity names/identifiers, descriptions, durations, categories/benefits, practical tips, illustrations and editorial ownership.
- Final copy for login/registration, invitation sharing, empty/error states, privacy explanations and support.
- A decision on which wellness labels/metrics are real product data rather than demonstration content.
- Current app-specific policies and any approved content explaining age/account eligibility.
- Approved asset versions and deployment rights for third-party imagery, sounds and footage.

Research/marketing health statements should not automatically become app efficacy claims. The supplied academic report discusses the broader literature; it is not a user trial proving Resbite outcomes. [S0913: embedded Keele report](sources.md#s0913).

## Owner update: smaller catalogue and future illustration production

The owner confirms that illustrations for 100 activities are not available, and a 100-activity first release is unnecessary. The owner selected 8–12 documented activities with existing artwork; the actual activity/artwork pairs are still to be chosen.

Proposed content workflow, not yet selected:

1. Match documented activities to suitable existing illustrations and copy. The owner selected an 8–12-item demonstration using existing artwork.
2. List missing artwork for the selected activities, with references to the existing brand style. Do not invent additional activities just to fill a target count.
3. If needed, create one sample illustration using image generation or a suitable plugin, review its consistency with the supplied artwork, then decide whether to produce the remaining gaps.
4. Track each final illustration's activity, original/generated provenance and review status. Preserve originals.

Generation is an internal production process, not an app feature. Tool/plugin choice remains open; none has been installed, purchased or used to generate artwork in this update. Future expansion can follow the same process without delaying a demonstration built from existing assets.
