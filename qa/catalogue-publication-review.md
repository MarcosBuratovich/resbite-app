# B0 catalogue publication review

Original review prepared 23 September 2026; preserved below as archival context. **Approved and published on 24 September 2026** for the owner-only beta under the exact scope hash below. Eight rows were inserted and independently matched to the complete approved payload. The owner subsequently confirmed signed-in refresh/artwork/details on iPhone: “All eight load correctly.” See the [executed publication record](catalogue-publication-2026-09-24/README.md).

Open [the visual review](catalogue-review.html) to inspect the exact eight current drafts with artwork, full text, practical tips, duration evidence and provenance. This page only prepares a reply to the development conversation; its controls do not save a decision, make network requests or change the app/database. Existing owner-only tester access is unchanged.

## Fixed review scope

The approval applies only to this snapshot. Recompute these hashes immediately before publication; any changed copy, categories, durations, provenance or PNG requires an updated review scope. All originals and source files remain untouched.

| Input | SHA-256 |
|---|---|
| `mobile/content/activities.json` (exact bytes) | `2ac2eeb2a1a954fe1e175af60359cb01efa8dd8d3e9dac15d4b8689984d62dc7` |
| `mobile/content/asset-provenance.json` (exact bytes) | `f33125428afd407e0a3e953a6b05e243edae265026fa0a8d4733cbd4843bd983` |
| Combined review scope | `148bebe1a58c48abe12a2fcd763c73c0f51e6067b7d095a328f4d5377c1c2df9` |

The combined hash is SHA-256 of UTF-8 JSON of the following object, serialized with recursively sorted object keys, no whitespace (`separators=(",", ":")`), and the artwork array in activity-manifest order. No file timestamps or absolute machine paths participate.

```json
{
  "manifestSha256": "2ac2eeb2a1a954fe1e175af60359cb01efa8dd8d3e9dac15d4b8689984d62dc7",
  "provenanceSha256": "f33125428afd407e0a3e953a6b05e243edae265026fa0a8d4733cbd4843bd983",
  "artwork": [
    {
      "activityId": "coffee-together",
      "path": "mobile/assets/activities/coffee-together.png",
      "sha256": "a7e20e2d713cd7d08e0d0cb3c71e4b1d7d6af3ca996edb142211884ed92326e2"
    },
    {
      "activityId": "painting",
      "path": "mobile/assets/activities/painting.png",
      "sha256": "1abb41711560349c640dc8ca095a2f3fb426d9794000b875501157069db1b186"
    },
    {
      "activityId": "get-out-with-bikes",
      "path": "mobile/assets/activities/get-out-with-bikes.png",
      "sha256": "435c450437f5178af6533968fb8f759a6d9ee446b99ffccad6d7240c0cf541d5"
    },
    {
      "activityId": "building-a-snowman",
      "path": "mobile/assets/activities/building-a-snowman.png",
      "sha256": "eda6a258bc26b74add4437fda3fc77846d1ceefc664ef41b5a69791ccb0b3457"
    },
    {
      "activityId": "bbq",
      "path": "mobile/assets/activities/bbq.png",
      "sha256": "ebb6bb518a88c8e1092298127e018eee8eaa1fde155ed24b1bdf952b37e0a84f"
    },
    {
      "activityId": "wine-tasting",
      "path": "mobile/assets/activities/wine-tasting.png",
      "sha256": "e3d9d1dcee3e5d327285b0b640743a52160ebc3f9171261b47401134acdd648f"
    },
    {
      "activityId": "spa-day",
      "path": "mobile/assets/activities/spa-day.png",
      "sha256": "79ca341072a7b446a000310b7fe7ed644e6089e3b287284e28aa780f243b2e21"
    },
    {
      "activityId": "book-club",
      "path": "mobile/assets/activities/book-club.png",
      "sha256": "067407c0b67dbf1e25d76dc0220f2ada242dd4b0a8de44dfb65dd71dea8552f1"
    }
  ]
}
```

The HTML embeds that object and the unmodified activity-manifest records in `#review-snapshot`. It uses only repository artwork/fonts and inline HTML/CSS/JavaScript, with no remote library or analytics.

## Original owner decisions — resolved for this batch on 24 September

1. **Approve or edit these eight exact title/description/tips/artwork pairs.** They are newly written editorial copy, not quotations of approved agency text. Keep or replace seasonal Building a snowman; retain or revise Book Club capitalization and other titles only if requested.
2. **Choose the B0 category treatment.** Current values mix discovery labels (`Adventure`, `Leisure`, `Meals & Drinks`) and benefits (`Creative`, `Intellectual`). Source S0618 separately lists discovery categories Sports, Games, Adventure, Food & drinks, Arts and Leisure, and wellness benefits Physical, Uplifting, Creative, Community, Natural, Mindful and Intelectual. The repository corrected that last spelling, but has not approved a canonical taxonomy or per-activity mapping. The concrete choice on the review page is to accept the exact displayed labels as temporary discovery filters for this owner-only beta, or request an edited taxonomy before publishing. This does **not** approve a wellness assignment or scoring formula; B5 must settle those separately.
3. **Accept the duration treatment.** Painting has a prototype-suggested 30 minutes (S0618), not a measured or required duration. The other seven stay `null`; do not invent defaults. Planned and self-reported actual time are separate later contracts.
4. **Confirm Wine tasting is suitable for the current owner-only beta.** It is documented for adult testers. This is not a general minimum-age decision or permission to broaden the cohort. Broader beta age policy remains open in the expanded plan.

The response can approve all of the above together, tied to the combined hash, or name exact edits. No new categories or activities are proposed by this review. The source archive's original files are not on this Mac; the register/extracted text and provenance hashes are available. Artwork provenance does not establish separate deployment rights.

## Original publication prerequisites — historical preparation

At the start of this review, the foundation table `public.activities` has `id`, `title`, `description`, `category`, `artwork_key`, `source_ids` and `published`; it does **not** store tips or suggested duration. [Discover](../mobile/app/(tabs)/discover.tsx) and [activity detail](../mobile/app/activity/[id].tsx) at that baseline use the bundled draft manifest even when signed in. Therefore inserting rows alone would not implement a server-authoritative publication/unpublication flow.

Before a real publication:

- Implement and verify a live catalogue read path that uses only server-published rows for signed-in discovery, search, detail and starting a new plan. Preview may continue using clearly labelled bundled review data. Empty, failed, stale and unknown-ID states must remain explicit; a network failure must not expose local unpublished drafts as a fallback.
- Preserve the exact reviewed tips and nullable duration. The coordinated publication implementation adds `tips text[]` (non-null, at most 12 entries, no null elements) and nullable `duration_minutes integer` (1–1440) on `public.activities`, with controlled maintainer writes. Migration `20260923152900_activity_catalogue_details.sql` is being prepared by the independent catalogue workstream; this review makes no hosted-deployment or completion claim. A reviewed alternative would need to bind bundled details to the approved manifest revision and still use the server to decide availability; it must not silently show unapproved local revisions.
- Map `artwork_key` to the stable activity ID used by the existing local artwork registry (for example `coffee-together`), with an explicit allowed-key check and safe missing-art state. This is the exact mapping agreed with the parallel live-catalogue implementation.
- Record the owner's exact approval, date and review hash in the publication record; treat any taxonomy/copy edits as a new snapshot. Preserve historical source/manifests, and make current draft/approved status truthful in the app and validator.
- Leave RLS, roster and write grants unchanged. The existing policy restricts reads to eligible authenticated testers and `published = true`; clients receive no direct catalogue mutation rights. See [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security). The 23 September changelog was read for this preparation; no applicable change requires a different catalogue contract.

## Approved payload projection — published on 24 September

The following preserves the original eight-row projection onto the foundation columns. The owner approved this snapshot unchanged; the executed payload also includes the exact tips/duration fields listed afterward. This historical projection is not an instruction to repeat publication or approve another batch. `artwork_key` uses the proposed stable-ID mapping above.

```json
[
  {
    "id": "coffee-together",
    "title": "Coffee together",
    "description": "Make time for a drink and a catch-up with people you know.",
    "category": "Meals & Drinks",
    "artwork_key": "coffee-together",
    "source_ids": [
      "S0618",
      "S0945",
      "S0716"
    ],
    "published": true
  },
  {
    "id": "painting",
    "title": "Painting",
    "description": "Paint a scene, an object or an abstract design together. Try different colours and let everyone take their own approach.",
    "category": "Creative",
    "artwork_key": "painting",
    "source_ids": [
      "S0618",
      "S0713"
    ],
    "published": true
  },
  {
    "id": "get-out-with-bikes",
    "title": "Get out with bikes",
    "description": "Get together for a bicycle ride and enjoy some time outside.",
    "category": "Adventure",
    "artwork_key": "get-out-with-bikes",
    "source_ids": [
      "S0618",
      "S0945",
      "S0714"
    ],
    "published": true
  },
  {
    "id": "building-a-snowman",
    "title": "Building a snowman",
    "description": "When there is enough snow, get together to build and decorate a snowman.",
    "category": "Creative",
    "artwork_key": "building-a-snowman",
    "source_ids": [
      "S0945",
      "S0705"
    ],
    "published": true
  },
  {
    "id": "bbq",
    "title": "BBQ",
    "description": "Share a barbecue and spend time together over food.",
    "category": "Meals & Drinks",
    "artwork_key": "bbq",
    "source_ids": [
      "S0618",
      "S0945",
      "S0706"
    ],
    "published": true
  },
  {
    "id": "wine-tasting",
    "title": "Wine tasting",
    "description": "Get together to compare wines and talk about what you notice.",
    "category": "Meals & Drinks",
    "artwork_key": "wine-tasting",
    "source_ids": [
      "S0618",
      "S0945",
      "S0710"
    ],
    "published": true
  },
  {
    "id": "spa-day",
    "title": "Spa day",
    "description": "Set aside time to relax together at a spa.",
    "category": "Leisure",
    "artwork_key": "spa-day",
    "source_ids": [
      "S0618",
      "S0619",
      "S0711"
    ],
    "published": true
  },
  {
    "id": "book-club",
    "title": "Book Club",
    "description": "Meet to talk about a book you have chosen together.",
    "category": "Intellectual",
    "artwork_key": "book-club",
    "source_ids": [
      "S0619",
      "S0945",
      "S0707"
    ],
    "published": true
  }
]
```

For the proposed complete schema, add these exact fields to each row before staging; their values come directly from the manifest (never from prose reconstruction):

```json
[
  {
    "id": "coffee-together",
    "tips": [
      "Choose a place where everyone can sit together.",
      "Agree a time that works for the group."
    ],
    "duration_minutes": null
  },
  {
    "id": "painting",
    "tips": [
      "Bring paints, brushes and something to paint on.",
      "Look at painting styles for inspiration."
    ],
    "duration_minutes": 30
  },
  {
    "id": "get-out-with-bikes",
    "tips": [
      "Agree the route and meeting place in advance.",
      "Choose a route everyone in the group is comfortable with."
    ],
    "duration_minutes": null
  },
  {
    "id": "building-a-snowman",
    "tips": [
      "Choose a suitable outdoor spot.",
      "Bring warm clothes and simple decorations."
    ],
    "duration_minutes": null
  },
  {
    "id": "bbq",
    "tips": [
      "Agree who is bringing the food and equipment.",
      "Check dietary preferences with your guests."
    ],
    "duration_minutes": null
  },
  {
    "id": "wine-tasting",
    "tips": [
      "Choose a suitable place and agree what to bring.",
      "Have water and alcohol-free options available."
    ],
    "duration_minutes": null
  },
  {
    "id": "spa-day",
    "tips": [
      "Choose the place together.",
      "Check availability before confirming your plan."
    ],
    "duration_minutes": null
  },
  {
    "id": "book-club",
    "tips": [
      "Agree the book before the meeting.",
      "Bring a question or a favourite passage to discuss."
    ],
    "duration_minutes": null
  }
]
```

## Execution plan after approval and implementation

1. Recompute all snapshot hashes. Stop on any mismatch. Read the current hosted schema, candidate IDs, publication state and RLS/grants; do not assume the earlier empty catalogue is still empty. Check that all eight local art keys resolve.
2. Run disposable database/security and client fixtures before hosted changes. If schema work is needed, follow the repository migration workflow, review advisors and apply only the reviewed migration under coordinator control.
3. Export a before-image of the eight candidate records (including missing IDs) and store a publication journal with project ref, exact approved payload, approval/hash and intended after-image. A repeated run with the exact after-image is a no-op; a conflicting existing row stops for review rather than overwriting it.
4. In one maintainer transaction, lock/check the candidate rows, stage only the approved payload and mark all eight published together after validation. Do not modify other activities, the tester roster, auth configuration, notification/deletion gates or grants. Keep an exact change count and commit result. If the reply is lost, read the rows and compare the exact after-image before retrying; never infer success from a timeout.
5. Verify the live owner session sees exactly the approved eight records and the expected full detail; anonymous and unapproved accounts see none. Perform negative checks with disposable identities/transactions where appropriate, without retaining synthetic testers or widening the roster.
6. On iPhone, refresh Discover, compose category/search filters, open every item, check artwork/full text/tips/nullable duration and start then abandon a plan draft. Verify the server rejects a new plan for an unpublished ID. Check Larger Text and offline/stale handling. Do not create/send invitations as part of content publication.
7. Record actual publication timestamp, payload/hash, DB/client/build versions, device observations and any remaining limits. The current review does not supply those future results.

## Rollback and recovery

- If the transaction fails before commit, nothing should be visible. Read back and compare before retrying after an uncertain response.
- If approval is withdrawn or a publication check fails after commit, use the journal to unpublish **only this batch's previously unpublished/new rows**; restore prior published flags/row content only where the current row still matches the expected after-image. A mismatch signals a later edit and must stop automatic rollback. Do not delete activity records: existing plans may reference them.
- A rollback must also refresh/invalidate catalogue state in the client and block new-plan creation for unpublished IDs. Preserve historical plan references; do not fabricate a different activity title for old plans. Do not blindly roll back the app to the current bundled-draft path, which would still display these activities.
- Verify the same access and availability checks after rollback. Retain the approval, before/after images and reason in the maintainer record; no tester or user data is needed in the content payload.

## Review-artifact validation

Passed local Chrome checks at 390 × 844 and 1280 × 960: all eight embedded records exactly match the manifest; rendered titles, categories, descriptions and all 16 tips match; eight 1200px artwork files load; provenance details open; decision/notes produce a scope-bound reply; no page errors, external requests or horizontal overflow. A larger-text stress check also has no horizontal overflow. Keyboard checks passed for the skip link, provenance expand/collapse and radio selection; reload clears review notes and selection as disclosed. Exact publication-row projections, supplemental tips/durations and current PNG hashes were independently compared with the source files. Screenshots were saved outside the repository at `/private/tmp/resbite-catalogue-review-390.png`, `/private/tmp/resbite-catalogue-review-1280.png` and `/private/tmp/resbite-catalogue-review-card-390.png`, and visually inspected. These are review-artifact checks, not hosted publication or native app acceptance.

## Evidence links

- [Activity manifest](../mobile/content/activities.json) · [Provenance](../mobile/content/asset-provenance.json)
- [Brand/content audit](../knowledge-base/06-brand-assets-and-content.md) · [Readiness review](../knowledge-base/10-brand-and-content-readiness.md)
- [Category source text, S0618](../knowledge-base/audit/extracted-text/S0618.txt) · [Source register](../knowledge-base/sources.md)
- [Expanded beta plan](../docs/milestones/2026-09-23-expanded-private-beta.md) · [Current implementation status](../docs/implementation-status.md)

## Schema preparation completed

The additive tips/duration migration was deployed separately on 23 September 2026 as hosted `activity_catalogue_details` version `20260923154040`. Read-back verified both fields, zero catalogue/published rows, one enabled owner and unchanged `eligible() AND published` RLS. No content approval or publication is implied. The current live reader and new-plan availability guards pass the targeted fixtures; device content review follows the explicit publication decision.


## Publication completed — 24 September 2026

The owner approved scope `148bebe1a58c48abe12a2fcd763c73c0f51e6067b7d095a328f4d5377c1c2df9` unchanged for the owner-only beta. All original manifest/provenance and PNG bytes still match that scope. Approval keeps the displayed category values as temporary discovery filters, Painting's 30 minutes as a suggestion, other durations unspecified and Wine tasting as an adult activity. The general age/access and wellness policies remain separate.

The coordinator committed the reviewed transaction at 12:58:29 UTC, inserting eight rows. Separate read-back at 12:59:30 UTC exactly matched the full approved after-image, with eight published records, enabled RLS, unchanged grants/read policy and one enabled owner. [Receipt](catalogue-publication-2026-09-24/publication-receipt.json), [verification](catalogue-publication-2026-09-24/post-commit-verification.json) and [journal/rollback handoff](catalogue-publication-2026-09-24/README.md) record actual execution. Hosted SQL role simulations returned owner eight, unapproved nonexistent principal zero and anonymous privilege denial; no Auth user was created. These are role simulations, not an actual new unapproved-account signup.

The owner confirmed “All eight load correctly” on iPhone after signed-in Discover refresh and opening artwork/details. New-plan creation, offline behavior and fresh Larger Text/VoiceOver/Reduce Motion checks were not part of that confirmation. The [separate new-activity review](new-activities-review.html) is outside this approved scope.
