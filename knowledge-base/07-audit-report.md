# Source audit report

Latest owner selections: **iPhone app, Google sign-in plus email/password with email confirmation, real invitations and RSVP between testers, location, notifications and contact import, and 8–12 documented activities with suitable existing artwork**. Illustration generation is planned for future gaps. Accounts are required; use Google or email/password with email confirmation. Guest RSVP is excluded. Notifications are limited to invitations, RSVP and plan changes; detailed permission handling remains to define. See [selectable decisions](05-open-questions.md).

17 September 2026. Scope: supplied local project folder and readable archive contents. No external product research, feature invention, deployment or messaging was performed.

## Owner clarification following the audit

The owner confirms that the agency's concept was never implemented. The immediate objective is a product for the boss to view and test, with limited time available. Neither 100 activities nor multiple registration methods is required. The owner confirms there is no illustration set for 100 activities and is open to planning future image generation/plugin-assisted production. These clarifications resolve the implementation-existence question and reduce immediate content needs; they do not alter the historical source findings below.

## Main findings

The folder contains a substantial product/design history, but not one clean current MVP specification. The most important discovery is the February 2025 V3 XD master in the supplementary archive. It retains older screens and overlays scope-reduction notes. Reading only the convenient August 2022 developer PDFs would materially overstate today's first-release scope.

The source-backed product is a private app for discovering and arranging real-world activities, coordinating attendees and reviewing wellness. The owner has chosen MVP first and separated premium/marketplace. The resulting [register](02-scope-register.md) has 58 traceable items: 12 core capability areas, 19 needing a decision, 9 deferred, and 18 across later features, marketplace, later concepts, exclusions, marketing and historical context. These counts describe the register, not an implementation estimate.

## Inventory and organization

- **1,070 original files**, totalling **3,832,979,602 bytes** (3.83 GB decimal).
- **912 distinct file contents** by SHA-256; **158 redundant file copies** beyond the first identical copy.
- Redundant copies total **488,053,077 bytes** (488 MB decimal). None were deleted; identical content can still occupy a meaningful place in a source project.
- Three overlapping original folder trees were grouped under `source-materials/`. Their internal subfolders and filenames were preserved.
- Two loose pitch PDFs were moved into `source-materials/pitch-decks/` and given descriptive names identifying WIP/2020 context.
- Every original file has a stable source ID, original path, current path, size and checksum in the [inventory](audit/inventory.json) and [move map](audit/file-moves.json).
- All original file checksums were verified after the moves. Hidden workspace control directories were left untouched and are not counted as source material.

The duplicate count is byte-level identity, not similarity. Different exports with identical-looking copy remain distinct unless their bytes match. The source ID designated `duplicate_of` is the first inventory copy, not necessarily the newest or preferred authority.

## Review coverage and limits

A complete inventory is not the same as a full native-editor review. The audit records the following coverage honestly:

| Content | Coverage achieved | Remaining limit |
|---|---|---|
| 148 PDFs / 112 distinct | Text extracted from 111; the image-only legacy pitch was rendered and visually surveyed; key decks, prototype pages and wireflow boards inspected | Not every historical PDF received page-by-page high-resolution visual QA |
| 27 PowerPoint files | XML text/notes extraction for 26; version/placeholder comparison for relevant decks | S0890 is encrypted; its contents remain inaccessible |
| 22 Word files | Document/header/footer/comment/footnote text extraction where present; content-family review | No full formatting/layout QA of each Word version |
| 5 spreadsheets / 4 distinct | Cells/formulas and workbook structure inspected; private data classified | Not a financial reconciliation or workbook recalculation exercise |
| 79 XD files / 77 distinct | Native text/manifest extraction, archive dates and saved previews; V3/V2.8 annotation comparison and coordinate context | Full native interaction wiring and visual rendering of every layer not validated |
| 203 AI files / 188 distinct | Embedded PDF text/first-page visual survey | Multi-artboard edits, linked dependencies and Illustrator editability not fully verified |
| 353 PNG/JPG / 297 distinct | Loaded and included in contact-sheet visual survey | Survey-level, not individual pixel-level production certification |
| 75 SVG / 70 distinct | XML parsed; external hrefs inspected | Native rendering not comprehensively compared across browsers |
| 24 video files / 20 distinct | Metadata and sampled frames; four prototype recordings sampled at 12 points each; explainer/storyboard families sampled | Full audio transcription and uninterrupted playback not completed |
| 9 WAV files | Metadata/duration, placement in voice-over family and related scripts/subtitles | Voice takes not transcribed or compared word-for-word |
| 9 ZIP files / 7 distinct | 465 file entries indexed, 220 matching already inventoried content; website top-level pages read; additional full report extracted | Not every nested binary/native file independently rendered |
| 3 RAR files / 2 distinct | 73 entries listed: Lottie assets and collected animation project | Lottie playback and After Effects project reopening not tested |
| Fonts, INDD, AEP, PSD, Sketch, misc. files | Inventory, duplicate detection, family classification; Sketch preview available; font licence texts retained | Native authoring behaviour, every font glyph, and metadata-only files not semantically certified |

The visual survey reviewed 728 generated/source thumbnail items across 16 contact sheets, plus sampled video frames. This includes pages and previews, so it is not a count of unique source files. The audit does **not** claim that every minute of recording or every proprietary project layer has been read.

### Specific unavailable content

- **S0890 — resbite-presentation-deck-10.pptx:** initial ZIP extraction failed. Inspection identified Office `EncryptedPackage` and `EncryptionInfo` streams. It is an encrypted Office file, not proven corrupt or mislabeled. An attempted local conversion could not load it. Original extension/content retained; request an unlocked copy/password only if this historical version matters.
- **S0906 — 27 May 2020 briefing:** approximately 45 minutes 16 seconds. Frame samples confirm a recorded discussion, but no transcript was located and no transcription tool was available. Spoken scope details remain unaudited. Do not infer decisions from the participants' presence or the recording title.
- **Native project files:** After Effects, InDesign and Photoshop editing/layer fidelity remains unverified. Existing exports provide a useful partial view, not a complete native-file certification.

## Audit by content family

### Product and experience

Strong documentation exists for registration, activity discovery, invitation, scheduling, location selection, attendee management, chat, account settings, groups, attendance limits and wellness. V3 introduces newer reductions but does not remove all old screens. See [precedence](04-source-precedence.md) and [journey rules](03-user-journeys-and-rules.md).

Material contradictions include guest vs account access, phone vs social authentication, child age/invitation policy, start/end-time requirements, event chat access, ownership transfer, automatic vs manual communication, and incompatible attendance-limit arithmetic. Each is recorded without choosing an undocumented answer.

Prototype V1.9 contains more realistic activity copy and styled screens but still has placeholders and uneven wellness exports. The wellness recordings give a stronger visual view than blank PDF states. Their presence does not resolve how real wellness values are calculated.

### Investor and business materials

The one-pager dates to July 2020 despite the name “new.” The top-level 13.1 PDF was exported in May 2026 but has many unfinished slides. Version 14 PowerPoint is also a placeholder-heavy template. The dated abbreviated deck and newer website are more informative for positioning and staged releases.

Prices vary: the early one-pager proposes £7.99/$9.99 monthly; premium screens show £5 monthly/£30 annually with trials; abbreviated decks show £6.99 monthly/£39.99 annually. Hosted commission varies between 15% in a dated deck and 10% in the undated AWS deck. These are conflicting historical proposals, not current pricing. No values were selected for MVP.

The AWS deck contains questions about Flutter, AWS architecture, analytics and recommendation engines. Those are discovery questions, not a confirmed technical architecture. Financial charts and roadmap years should not be used as current commitments or live traction.

### Research

The full Keele report was found **inside the website ZIP**, in `website-main/downloads/Social-media_Benefit-vs-harm.pdf`, not just in the visible summary folders. An unchanged accessible copy is provided in [reference-extracts](reference-extracts/keele-social-media-benefits-and-harms-2021.pdf).

It is a March 2021 literature review covering uses, rewards, potential harms, dependency, demographic differences and dating, with references and an appendix. It explicitly discusses limits in study generalisability and calls for broader analysis. The shorter summary decks lose some of that nuance and contain editing errors (for example unrelated bullet text intruding into the harm taxonomy). The research supports understanding the design rationale; it does not verify app-specific health outcomes. No new literature search was performed as part of this source audit.

### Website, marketing and operations

The dated website ZIP contains a static website with HTML/CSS/JavaScript and form-related PHP/assets. It includes product, research, jobs, investor, privacy, cookie and terms pages. Its staged product roadmap and design ethics are useful newer evidence. A claimed launch year is still a plan, not proof of launch.

The January 2025 social media proposal concerns external marketing, awareness, content planning and a copywriter/community-manager role. It does not authorize an in-app public feed or social-ad product. Referral documents explore Typeform/Google Sheets and personal links; these are acquisition-programme concepts with unresolved operational choices.

The website QA workbook describes website issues and statuses; “solved” there does not establish mobile-app implementation. The website timesheet covers 2024–2025 work and has a report date of 8 April 2025. The rates workbook is a historical agency costing template, not a new Resbite budget.

The form workbook contains identifiable contact submissions, IP addresses and messages. The cookies-named DOCX is an operational account note rather than an actual cookie policy. Their details were not copied into the product foundation or retained as general-purpose text extracts. Originals remain local and indexed. Actual website policy pages were found inside the ZIP; app-specific policy coverage remains unconfirmed. This audit checks source scope and completeness, not legal compliance.

### Brand and media

Brand/artwork is extensive and broadly consistent. The main readiness concerns are placeholder guides, colour-label errors, old naming, reference/stock imagery mixed with production assets, and unverified native dependencies. See [brand and content audit](06-brand-assets-and-content.md).

The explainer scripts/subtitles and animation assets clearly communicate a closed private network and rejection of likes, walls and public profiles. Numerous source/voice/video revisions are preserved. Later numbered collected After Effects projects exist in RAR, but this does not identify the approved final video export.

## What was deliberately not changed

No original content was rewritten, no duplicates were removed, and no historical source was promoted to “approved” just because it was convenient. Only archive-root organization and the names of the two loose PDFs changed. No repository, cloud infrastructure, app screens, payment flow or external account was created.

## Completion status

The folder inventory, organization, source-backed foundation, scope classification, contradictions register and audit findings are delivered. Complete semantic coverage is still limited by the encrypted deck, untranscribed recordings and native-editor project content described above. Those limits are explicit follow-up evidence gaps; they are not a reason to invent missing requirements or expand the scope.
