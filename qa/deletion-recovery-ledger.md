# Independent deletion recovery ledger

29 September 2026. Local core implemented and tested with synthetic data only. No provider configured, records exported, account deleted or release gate opened.

## Purpose and proposed destination

Keep the minimal evidence needed to reapply an explicitly requested deletion when a database backup predates that request. The owner has no separate destination yet and asked whether Supabase Storage can be used. A private bucket in a **separate Supabase project** is a suitable candidate, subject to provider testing and owner selection. A bucket in the application project shares its restored Storage metadata and is not an independent recovery catalogue. A second project does not protect against loss of the entire provider account; operators still need recoverable credentials/key custody and an agreed disaster scope. No project creation or spending is authorized by this document.

Supabase database backups preserve Storage metadata, not object bytes: https://supabase.com/docs/guides/platform/backups . Provider guidance was retrieved 29 September before implementation.

## Implemented primitive

`supabase/functions/_shared/deletion-ledger.ts` takes an injected immutable store and a 32-byte server-side encryption key. It accepts only schema version, source-project identifier, user UUID, deletion-request UUID and canonical UTC request time. Extra fields are rejected. There is no email, profile, password, session token, fresh-auth proof or receipt recovery secret in the payload.

AES-256-GCM encrypts the payload with a random 96-bit nonce. Authenticated additional data binds the envelope to its source project and hashed object path. The key is imported non-extractable; operators must preserve its original source outside any database being restored. Object keys hash the project/request identifier; the encrypted objects still require private access controls and a retention policy.

`record` validates an existing immutable object, or attempts atomic create-if-absent and then independently reads/decrypts it. An unknown write response succeeds only if that read-back matches the complete intended payload. Missing records, failed reads, invalid encryption, or conflicting contents stop confirmation. Concurrent identical writes converge; a request identifier cannot silently acquire a different identity or timestamp. Adapter guarantees (atomic creation, consistency, durability, bounded responses and private access) still require verification against the chosen provider.

This primitive is intentionally not connected to the current deletion handler. Calling it does not authenticate a person or authorize deletion. Its timestamp must come from a stable, server-prepared request, not be regenerated on retry.

## Remaining integration sequence

1. Select the independent private destination and key custody/recovery process. Implement its bounded server-only adapter with create-if-absent and verified reads. Test outages, existing-object conflicts, lost replies and provider permissions.
2. Split deletion admission into a server-authorized preparation and final activation. Preparation validates the same-account fresh proof, locks the account, reserves stable request data and prevents conflicting requests. It must not acknowledge an accepted deletion or begin destructive work before the independent intent is verified. Existing SQL currently accepts and queues deletion in one transaction; it cannot simply be followed by a ledger upload.
3. Define durable intent as the point of no return. After its verified write, activate the database access block/job and retry uncertain activation with the same request. Reconcile prepared requests/ledger records after crashes. Do not discard a potentially persisted intent when an acknowledgement is lost, and do not interpret a failed SQL activation as proof that no deletion was requested.
4. Before restore, fence **all** application and worker access. Enumerate the independent ledger completely with authenticated inventory/checkpoint evidence, not just a caller-supplied list. The current per-record API proves integrity of records presented, not completeness: omitted/deleted records and old inventories are not detectable by this core alone.
5. Reapply verified intents through a restricted, idempotent restore path and reconcile actual Auth and Storage state. Never run the ordinary fresh-session admission RPC as the restore implementation. Keep access fenced if any inventory, key, replay or provider check is unresolved.
6. Rehearse with explicitly disposable identities and an older isolated database snapshot. Show that deleted accounts cannot regain access and partial cleanup resumes. Record the checkpoint, aggregate results and operator sign-off before reopening.
7. Decide ledger retention across every recoverable backup/export window. No ledger pruning API exists yet. A 30-day operational receipt window does not automatically authorize deleting recovery evidence.
8. Custom events (CE1, 7 October 2026): before enabling deletion, verify on the deployed database that activation leaves a deleted organizer's events titled `Resbite` with an empty description (`plans_redact_deleting_owner` trigger), and (CE2 shipped 7 October 2026, hosted `20261007175855`) that the worker removes the deleted organizer's `plan-covers` objects. This includes replaced and removed covers that are no longer attached: clients never delete cover objects. `redact_deleting_owner_plan` already detaches `cover_path`. `private.guard_photo_write` fences only `profile-photos` writes, so it does nothing for `plan-covers`; cover uploads during deletion are instead refused by the cover policies' `private.eligible()` check, which is false once `deletion_requested_at` is set or an account deletion job exists.

Source release gates remain false until this sequence, retention approval and live provider acceptance are complete. The signup-test identity has not been designated disposable.

## Verification

Six injected tests pass: encrypted round-trip/restart, lost acknowledgement, post-write read outage, concurrent retry/conflict, tamper/wrong-key/relocation rejection, and strict minimal payload/size validation. The separate entry-point release test also passes: all four destructive endpoints remain disabled with all enable variables set and make zero network calls. Tests use synthetic UUIDs, keys and an in-memory store only.

## Supabase Storage adapter — 29 September

Implemented `deletion-ledger-storage.ts` for a distinct hosted recovery project. Configuration rejects the application project, unsafe bucket/object names and credentials whose decoded configuration claims do not identify the recovery project's `service_role`. This decoding is only a misconfiguration check; Supabase verifies signatures and actual authorization. The adapter currently supports a legacy server-only service-role JWT, not a publishable key or modern opaque secret key. Credentials must never be pasted into chat or stored in the mobile bundle.

Every operation verifies the bucket's metadata reports the expected ID and `public: false`. Upload uses POST with `x-upsert: false`; no update/delete API is exposed. Reads use the authenticated Storage object endpoint and accept absence only for the documented `NoSuchKey` code after private-bucket verification. A generic 404, missing bucket or permission failure blocks progress. Provider acceptance must verify the actual credential has full intended read access, because providers can conceal inaccessible objects as missing.

Requests use a ten-second abort signal, reject redirects, request no caching and bound streamed responses to 8 KiB. Errors omit upstream bodies and credentials. The ledger core independently decrypts and compares content after a write, including a lost acknowledgement. This adapter does not make Supabase objects immutable against administrators, prove listing completeness, or protect against bucket settings changing concurrently; those remain operational/provider requirements.

Six HTTP-adapter tests plus six ledger tests and the release-gate test pass (13 total), as does focused TypeScript checking. All HTTP tests are injected; no live project, bucket, credentials or records were created. No deletion handler is connected to this adapter yet.

Protocol references reviewed: [standard uploads and first-writer concurrency](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [Storage error codes](https://supabase.com/docs/guides/storage/debugging/error-codes), and the installed official storage-js download/bucket client implementation. Live destination selection, bucket/role provisioning, key custody and provider acceptance remain outstanding.

## Admission coordinator and local SQL — 29 September

Implemented `deletion-admission.ts`: prepare an authorized stable intent, verify the exact independent ledger record, then activate the matching database reservation. A mismatched ledger response cannot activate a different user/request/time. Failed or uncertain writes leave the request unconfirmed; no success response or session revocation is issued by the HTTP handler before verified persistence and successful activation. Lost activation replies retry the same record/job. Input receipt secrets are passed only to the private backend, never to the ledger.

Local migration `20260929125858_deletion_intent_reservations.sql` adds the RLS-protected reservation table and service-only prepare/activate wrappers with locked-search-path private implementations. Preparation checks fresh eligible authentication for a new reservation and fixes its time/receipt hash under the account lock. Matching server-side retries retain that reservation without requiring the original proof session to remain fresh. Activation checks project, request, user, time and recovery hash before applying the existing access-block/redaction/cancellation/job semantics. SQL trusts the server-side coordinator's assertion that ledger persistence is verified; it does not independently call external Storage.

`accountDeletionGateway.withLedger(project, recorder)` composes the real prepare/activate HTTP RPC adapter with this coordinator. The uncomposed `request.request` now fails closed without any network operation. The deployed-entry source remains disabled and unconfigured; no runtime secrets or hosted migration were added. The previous raw deletion RPC remains in the local historical migration for existing lifecycle fixtures; it is not called by the new gateway and its service-only grants must be reviewed/retired as part of the final deployment dependency set. Reservations have no automatic purge pending the recovery/retention policy.

Nine admission tests cover sequencing, preparation rejection, mismatched/private payloads, uncertain persistence, identity substitution, interruption before activation, lost activation replies, HTTP acknowledgement/revocation behavior and actual RPC adapter composition. All 51 backend tests and focused TypeScript checking pass. Disposable PostgreSQL passes all 11 assertion files and the existing four concurrency scripts; the new SQL assertions check privileges, stable preparation, receipt/time rejection, no premature mutation, activation after proof expiry, idempotency and access redaction. No provider integration or new preparation concurrency race is claimed by those four existing scripts.

Remaining work: independently complete inventory/checkpoint evidence; fenced restore replay; background reconciliation for durable intents whose original proof/HTTP session has expired; runtime configuration and provider acceptance. Ordinary HTTP admission still requires fresh proof, so it is not the background reconciliation or restore endpoint. Keys, destination and retention decisions remain unset. Release gates stay false.
