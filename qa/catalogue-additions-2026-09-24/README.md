# Three approved catalogue additions — 24 September 2026

**Published and independently verified on 24 September 2026.** The coordinator inserted all three at 13:17:41 UTC after mobile checks, an iOS export and fresh bundle delivery to the connected iPhone. Independent read-back at 13:17:56 UTC matched every new field, preserved all eight original rows and confirmed eleven total activities, unchanged RLS/grants and one enabled owner. [Commit receipt](publication-receipt.json), [read-back](post-commit-verification.json), [journal](journal.json).

The owner answered **“love it, keep them”** after reviewing and being asked which of the three new concepts to keep or refine. That selects these exact entries and their reviewed v2 illustrations:

| ID | Title | Temporary discovery label | Suggested duration |
|---|---|---|---|
| `picnic-in-the-park` | Picnic in the park | Meals & Drinks | null |
| `walk-and-talk` | Walk and talk | Leisure | null |
| `board-game-night` | Board game night | Leisure | null |

The approved concept-manifest SHA-256 is `8b077f214b5cf42a446f88f47dc36f6bb0ee41e18b08eea60fc18d6307f7d6bf`. It includes the exact titles, descriptions, tips, null durations and each reviewed PNG's hash. Recomputed manifest and image hashes match the original provenance. The source manifest's draft status is retained as historical context; this journal is the approval overlay. No additional wellness, general age or tester-access policy follows from this approval.

## Inputs and execution files

- [Approved payload](approved-payload.json): exact three server rows. `artwork_key` is the activity ID; each `source_ids` array contains `R20260924-<id>` to identify newly created editorial content separately from original archive source IDs.
- [Approved scope](approved-scope.json): reviewed manifest hash, provenance-file hash and exact reviewed-to-mobile PNG mapping. Mobile copies must preserve PNG bytes and use `mobile/assets/activities/{id}.png`.
- [Original-eight before-image](original-eight-before-image.json): complete records already approved and published in the original batch. They must remain exactly unchanged.
- [Hosted preflight](hosted-preflight.json): read-only check at 13:13:29 UTC confirmed all eight original rows match their approved after-image, none of the three additions exist, and the exact single-owner scope still holds. RLS/grants were captured too.
- [Publish SQL](publish.sql), [verification SQL](verify.sql), [rollback SQL](rollback.sql), [journal](journal.json) and [prepared hashes](artifact-hashes.json).

## Guarded transaction

The publication protocol reuses the locally tested original-eight transaction, restricted to this new three-row batch. It holds the catalogue writer lock and a shared roster lock in the same order, with short lock/statement deadlines. It verifies the exact table column, read-policy, grant and single-owner contracts.

The original eight are compared field-for-field before and after the new writes. Any missing or changed original record stops publication. This preserves existing titles, descriptions, tips, durations, artwork keys, source IDs and published state; the new transaction does not reinterpret their approval.

All three additions must be absent, or all three must already match the intended after-image. The first case inserts exactly three; the second returns a zero-write receipt. A partial batch or conflicting candidate aborts. Unrelated rows are not changed. The receipt includes the three before/after records and the preserved original-eight after-image. Save it after commit, then run the read-only `verify.sql` separately and compare both sets of rows with their saved payloads. Expected current catalogue count is eleven if nothing unrelated has been added.

Keep the journal's initial absent candidate before-image on a retry; do not replace it with an already-published replay result. If a reply is lost, read the actual rows before deciding whether to replay. This publication changes no Auth account, roster entry, RLS/grant, storage object, plan or release gate.

## Rollback

`rollback.sql` unpublishes only exact matching new additions and retains their rows for existing plan references. Exact already-unpublished additions or absence are no-ops. A later edit to an addition, any change to the original eight, or a changed owner/access contract aborts for review. The original eight remain published and byte-for-value unchanged. A reverted batch requires review before republication; the original insert-only transaction intentionally rejects existing unpublished additions.

## Local evidence

Run from the repository root:

```sh
python3 qa/catalogue-additions-2026-09-24/verify-local.py
```

This accepts no hosted URL, uses a private Unix-socket-only disposable PostgreSQL 17 cluster and removes it afterward. [Results](local-validation.json) cover exact hash/payload provenance, three additions coexisting with all eight originals, zero-write replay, unchanged unrelated row and access controls, FK-preserving rollback/replay, partial/conflicting candidate rejection, original-eight drift rejection, concurrent duplicate publication and wrong-owner/additional-tester/RLS rejection.

TypeScript, 113 mobile tests, content/artwork validation and extended 320/390 catalogue browser fixtures pass, including all three additions' search, artwork/detail, preview creation and saved-plan editing. The iOS Hermes export includes all three exact PNGs. The connected iPhone received the compatible bundle before publication; the owner has been asked to check the new entries. Physical-device acceptance remains pending and is separate from the original eight's earlier acceptance.

References: [reviewed concepts](../new-activities-review.html), [original generation/provenance record](../activity-concepts-2026-09-24/README.md), [original-eight publication](../catalogue-publication-2026-09-24/README.md).
