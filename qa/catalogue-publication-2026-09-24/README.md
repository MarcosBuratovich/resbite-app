# Approved first catalogue — publication handoff

Published by the coordinator on **24 September 2026 at 12:58:29 UTC**: eight inserted, zero pre-existing entries changed. A separate read-back at 12:59:30 UTC matched the complete approved payload. The receipt and verification are attached to `journal.json` and saved separately. The owner subsequently confirmed on iPhone: “All eight load correctly” after signed-in Discover refresh and opening artwork/details. This acceptance does not cover live plan creation, offline behavior or a new Larger Text check.

The owner approved the exact eight-entry review scope `148bebe1a58c48abe12a2fcd763c73c0f51e6067b7d095a328f4d5377c1c2df9` for the owner-only beta: displayed labels as temporary discovery filters, Painting's suggested 30 minutes, other durations unspecified, Wine tasting as an adult activity. Wider access, a general age policy and wellness taxonomy remain separate. This approval overlay preserves the original manifest/provenance bytes and review snapshot; their historical `editorial-draft` fields are not silently rewritten.

## Publication records and recovery files

- `publish.sql`: exact eight-row, atomic, insert-only transaction executed by the coordinator against project `ewcsgvhuojxdpaspwsrx`; retained for review and controlled recovery. No client key or credentials are included.
- `approved-payload.json`: complete server row values, including tips, nullable duration and artwork keys without `.png`.
- `approved-scope.json`: exact approved input hashes and original combined hash.
- `hosted-preflight.json`: read-only hosted rows, schema, constraints, RLS and grants at 12:53:12 UTC, plus exact-owner boolean at 12:57:53 UTC. Catalogue was empty; one approved owner enabled; deployed schema and policy matched.
- `journal.json`: preserved initial absent-row before-image, approved after-image, actual commit/read-back, hosted role-check summary and the scoped iPhone acceptance. No rollback has been run. Never overwrite the initial before-image with a repeat run's already-published rows.
- `publication-receipt.json` and `post-commit-verification.json`: actual hosted commit and independent exact after-image/access evidence.
- `verify.sql`: reusable read-only full-row and access read-back.
- `rollback.sql`: conditional unpublication for only this original batch, retaining catalogue records and plan foreign keys.
- `verify-local.py` / `local-validation.json`: repeatable disposable PostgreSQL rehearsal and observed results. No hosted URL is accepted.
- `artifact-hashes.json`: SHA-256 of the prepared SQL, payload and validation artifacts. Changing SQL requires review and another local rehearsal.

## Transaction behavior

`publish.sql` accepts only an entirely absent candidate batch or all eight existing rows matching the approved after-image exactly. The first case inserts eight; the second is a zero-write replay. A partially present batch, an unpublished candidate or any difference in title/category/copy/tips/duration/art/source IDs aborts without overwriting rows. Unrelated catalogue rows are never targeted.

It takes a brief `SHARE ROW EXCLUSIVE` catalogue lock to serialize writers and protect initially absent IDs, followed by a `SHARE` roster lock to preserve the owner-only scope through commit. Ordinary catalogue reads remain available. Both scripts use the same lock order, a five-second lock deadline and 15-second statement/idle deadlines. The exact table-column, RLS/read-policy and anonymous/authenticated privilege contracts are checked. A roster with any enabled identity other than the approved owner, or more than one enabled entry, aborts. No roster, policy, grant, Auth, plan or storage mutation occurs.

The SQL returns a receipt after `COMMIT`, including this attempt's before/after rows and write counts. Save it, then run `verify.sql` in a separate call and compare the full candidate rows against `approved-payload.json` (order by ID for comparison). Confirm all eight published, one enabled owner and unchanged RLS/grants. If the tool reply is lost, perform the read-back before deciding whether the exact idempotent replay is necessary. A timeout itself is not success.

## Rollback behavior

Only use `rollback.sql` with this journal's original all-absent before-image. It unpublishes matching batch rows without deleting them; existing plan references survive. Already-unpublished exact rows and absent rows are harmless no-ops. Any later edit to another field aborts the entire rollback for review. Rows outside the eight approved IDs are preserved. The same owner/access guards apply.

A successfully rolled-back catalogue does not match `publish.sql`'s expected after-image, so republishing intentionally stops for review instead of bypassing the rollback. Refresh client catalogue state after rollback, verify unpublished activities cannot start new plans, and retain the full audit record.

## Rehearsal evidence

Run from the repository root:

```sh
python3 qa/catalogue-publication-2026-09-24/verify-local.py
```

The script uses the installed PostgreSQL 17 binaries, creates a private Unix-socket-only cluster under `/private/tmp`, loads the local migrations, exercises both exact SQL files and destroys the cluster. It does not inspect or accept hosted credentials. Eight assertion groups passed:

1. Approved manifest, provenance and eight PNG hashes match the original scope; both embedded SQL payloads match exactly.
2. First publish inserts eight; replay writes zero and preserves row `xmin`; full before/after receipts match.
3. Rollback/replay preserve a real plan foreign key and all records; republishing after rollback stops.
4. Partial batches, conflicting pre-existing copy and rollback after later edits abort atomically.
5. Concurrent duplicate publication produces one eight-row insert and one zero-write replay.
6. Eligible owner can read; unapproved user sees no rows; anonymous reads fail.
7. Wrong sole owner or extra enabled tester blocks both scripts.
8. Changed RLS blocks both scripts. Unrelated row, grants, RLS and roster are unchanged by successful publication/rollback.

The local tests remain separate evidence from the subsequent hosted deployment. Hosted role simulations reported by the coordinator returned eight rows for the approved owner, zero for an unapproved nonexistent principal, and privilege denial for anonymous reads. They created no Auth user and do not replace a real unapproved-account registration test. Hosted RLS/grants and the one-owner roster were unchanged. The owner accepted signed-in catalogue refresh/artwork/details on iPhone; live new-plan, offline and fresh accessibility checks were not reported by that response.

References: [original visual review](../catalogue-review.html), [publication review](../catalogue-publication-review.md), [PostgreSQL lock compatibility](https://www.postgresql.org/docs/current/explicit-locking.html), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Supabase's current changelog was reread on 24 September; no relevant catalogue change was found.
