import type { DeletionGateway, DeletionStatus } from "./account-deletion.ts";
import { validateDeletionIntent, type DeletionIntent } from "./deletion-ledger.ts";

export type DeletionPreparation = {
  userId: string;
  sessionId: string;
  requestId: string;
  recoveryToken: string;
};
export type DeletionAdmissionBackend = {
  // Must atomically validate fresh same-account authorization and reserve an
  // immutable request/time under the account lock. No destructive work here.
  // Retry requires the same user/request/recovery secret, even after expiry.
  prepare(input: DeletionPreparation): Promise<DeletionIntent>;
  // Service-only, idempotent activation of that exact reservation. The SQL
  // adapter must compare every intent field and recovery hash under the lock.
  // Once ledger intent is durable, expired proof must not prevent reconciliation.
  activate(intent: DeletionIntent, recoveryToken: string): Promise<DeletionStatus>;
};
export type IntentRecorder = {
  record(intent: DeletionIntent): Promise<DeletionIntent>;
};

/** Local coordinator only: reservation/activation SQL adapters are not wired. */
export function ledgerBackedDeletionRequest(
  project: string,
  backend: DeletionAdmissionBackend,
  ledger: IntentRecorder,
): DeletionGateway["request"] {
  if (!/^[a-z0-9-]{1,64}$/.test(project)) throw Error("Invalid deletion project");
  return async (userId, sessionId, requestId, recoveryToken) => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    if (![userId, sessionId, requestId].every(value => uuid.test(value)) ||
        !/^[0-9a-f]{64}$/.test(recoveryToken)) throw Error("Invalid deletion preparation");
    // Authorization remains ahead of external persistence, never inferred from
    // client metadata or the mere presence of a record in the ledger.
    const prepared = validateDeletionIntent(await backend.prepare({ userId, sessionId, requestId, recoveryToken }), project);
    if (prepared.userId !== userId || prepared.requestId !== requestId)
      throw Error("Deletion preparation identity mismatch");
    const expected = JSON.stringify(prepared);
    const verified = validateDeletionIntent(await ledger.record({ ...prepared }), project);
    if (JSON.stringify(verified) !== expected) throw Error("Deletion ledger confirmation mismatch");
    // No acknowledgement, revocation, cleanup or activation occurs before the
    // exact durable record is verified. Do not roll back/delete a ledger intent
    // on failure: its acknowledgement or the activation reply may be lost.
    const result = await backend.activate({ ...prepared }, recoveryToken);
    if (!result || result.requestId !== requestId ||
        !["queued", "processing", "complete"].includes(result.status))
      throw Error("Deletion activation unconfirmed");
    return { requestId: result.requestId, status: result.status };
  };
}
