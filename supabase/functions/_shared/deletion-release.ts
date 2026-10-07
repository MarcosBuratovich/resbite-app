// Keep false until retention approval, independently durable deletion recovery,
// restore rehearsal and isolated Auth/Storage acceptance are recorded together.
// Environment configuration alone must not activate destructive operations.
export const ACCOUNT_DELETION_RELEASE_APPROVED = false;

// Receipt purging additionally requires proof that all retained backup/export
// windows are covered by the independent deletion ledger and replay procedure.
export const DELETION_RECEIPT_PURGE_RELEASE_APPROVED = false;
