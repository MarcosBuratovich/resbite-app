# Which sources control scope

## Owner decisions

On 17 September 2026 the owner specified:

- Stay within supplied information; do not invent features.
- When information conflicts, the more recent information wins.
- Start with the MVP; keep premium and marketplace separate.

These decisions control this audit. A question in a newer source remains a question. An inherited old screen inside a newer file is not a new approval of that screen.

## How recency was determined

Use explicit changes and authored dates where available, then embedded modification metadata, then archive-member timestamps and dated handoff folders. Filesystem copy times in this import do not determine product chronology. Higher version numbers only order versions in the same family; V3 wireflows and V1.9 prototypes are different families.

Export dates are evidence that a file was exported, not proof every sentence was updated. The top-level 13.1 PDF was exported in May 2026 but contains extensive placeholder text. Its finished statements remain evidence of positioning/features; blank roadmap or premium slides cannot override a defined earlier release boundary.

| Source | Date evidence | How to use it |
|---|---|---|
| [S0945 — MVP Screens, Wireflow V3](sources.md#s0945) | XMP modified 24 February 2025; explicit new annotations compared with V2.8 | Controlling concrete MVP reductions and open design questions |
| [S0913 — website snapshot](sources.md#s0913) | Archive filename 21 February 2025; key HTML member timestamps 18 October 2024 | Newer product positioning, ethics and v0/v1/v2 separation; planned dates are not release evidence |
| [S0619 — prototype V1.9](sources.md#s0619) | Archive entries February 2023 | Styled interaction/content reference, subordinate to later V3 cuts |
| [S0893 — abbreviated deck v5 PDF](sources.md#s0893) | PDF created 24 August 2022; cover still says December 2021 | Business background; illustrates why cover dates and exports must be recorded separately |
| [S0943 — master wireflow V2.8](sources.md#s0943) | Archive entries February 2022 | Comparison baseline for V3; older retained details |
| [S0671–S0689 — developer PDFs](sources.md#s0671) | Handoff folder dated 22 August 2022; corresponding ZIP members mostly March–April 2021 | Readable legacy rule detail; do not treat folder date as individual screen authorship |
| [S1069 — presentation 13.1 WIP](sources.md#s1069) | PDF created/modified 21 May 2026 | WIP; usable finished statements only, no blanket scope authority from export date |
| [S0950 — AWS deck](sources.md#s0950) | No reliable embedded date found | Technical/business questions; cannot order against dated sources without more evidence |
| [S0733 — one-pager](sources.md#s0733) | PDF created/modified 28 July 2020 | Historical early positioning, rewards and subscription proposal |
| [S0102 / S0103 — brand v06/v07](sources.md#s0102) | v06 content dated August 2020; v07 saved March 2021 | v06 contains usable detail; v07 is incomplete and contains unrelated pitch placeholders |

## What changed in V3

The native V3 file was compared with V2.8. Its extracted text retains the older text and adds scope notes. It is not a clean, reduced screen set. The [full annotation evidence](audit/v3-notes.json) records artboards and note text; [positions and neighbouring text](audit/v3-anchors.json) record how ambiguous notes were associated with screen regions.

| New note | Location | Treatment |
|---|---|---|
| Activities are a priority | F, Discover | Core activity discovery |
| Favorites are not a priority | F, favourites row | Defer activity favourites |
| Not a priority | F, near previously completed row | Deprioritize that Discover row; not evidence to delete all history data |
| Maybe these are too many Filters for an MVP | F, filters | Ask which filters remain; not a decision to remove search |
| maybe it's too much having similar resbite | F, similar activities | Unresolved; exclude from mandatory core |
| Should hosted resbites Be part of the MVP? | F | Owner resolved this audit: marketplace separate |
| Maybe Invitees don't need to create an account… | K | Guest access is an open option |
| Child account not part of MTV | G, parent/child invitation | Likely MVP typo; defer child accounts, explicitly flag interpretation |
| Not a priority… invitations will be done manually by the user | I, Notifications area | Manual delivery direction; detailed automatic notification centre is not mandatory core |
| Not a priority to Assign other invitees as owners | H | Defer ownership assignment; owner-leaves rule remains open |
| Not for MVP | B, near profile photo screens | Defer photo onboarding provisionally; exact note coverage needs confirmation |
| Not a priority | L, near feedback | Reduce post-event extras; cannot determine its full coverage confidently |
| Not a priority if we don’t classify contacts at this stage | C, imported/classified contacts | Reduce contact classification; connection method remains to be decided |
| Not a priority | C, connection-request notification area | Deprioritize elaborate request aggregation |
| Open to possibility to sign-up with Apple or Google account | Pasteboard note | Source proposed alternatives; owner selected Google (D10), then added email/password with email confirmation (D17) |

## Resolved and unresolved conflicts

- **Virtual rewards:** early one-pager/challenges versus newer no-gamification ethics. Newer ethics wins; no badges, points, trophies or virtual reward loops in MVP.
- **Ads / paid featured placement:** old F note versus newer no-ads statement. No in-app advertising or sold featured slots in the foundation.
- **Child accounts:** website v0 copy versus later V3 note. Later V3 narrows MVP; child subsystem deferred. Under-13 versus under-16 age thresholds remain a later-stage question.
- **Premium and marketplace:** owner explicitly separates them; neither a WIP deck feature list nor a retained old artboard reintroduces them.
- **Authentication, guest invitations, attendance mathematics, chat access and after-event scope:** no unambiguous dated resolution. These remain open.

Recency resolves an actual conflict about the same fact. It does not make website marketing copy a complete interaction contract or make a save operation equivalent to approval of every inherited layer.
