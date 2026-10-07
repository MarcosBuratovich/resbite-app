/** Durable receipt only: never store passwords or authentication proofs. */
export type DeletionReceipt = {
  accountId: string;
  requestId: string;
  recoveryToken: string;
};
export type DeletionStatus = "not_found" | "queued" | "processing" | "complete";
export type DeletionDependencies = {
  enabled: boolean;
  preview: boolean;
  accountId: string;
  assertCurrent: () => void;
  load: () => Promise<DeletionReceipt | null>;
  save: (receipt: DeletionReceipt) => Promise<void>;
  createReceipt: () => DeletionReceipt;
  status: (receipt: DeletionReceipt) => Promise<DeletionStatus>;
  reauthenticate: () => Promise<{ accountId: string; accessToken: string }>;
  request: (receipt: DeletionReceipt, proof: string) => Promise<DeletionStatus>;
  cleanup: () => Promise<void>;
};
export function createAccountDeletionFlow(d: DeletionDependencies) {
  let flight: Promise<DeletionStatus> | null = null;
  const guard = () => {
    if (!d.enabled || d.preview)
      throw new Error("Account deletion is unavailable in this build.");
    d.assertCurrent();
  };
  async function run(confirmed: boolean) {
    guard();
    if (!confirmed)
      throw new Error("Confirm permanent account deletion first.");
    let receipt = await d.load();
    guard();
    if (receipt && receipt.accountId !== d.accountId)
      throw new Error("The saved request belongs to another account.");
    if (!receipt) {
      receipt = d.createReceipt();
      if (receipt.accountId !== d.accountId)
        throw new Error("Account changed. Start again.");
    }
    await d.save(receipt);
    guard();
    // Read first even on the first attempt: a lost reply must not create a new operation.
    let status = await d.status(receipt);
    guard();
    if (status === "not_found") {
      const proof = await d.reauthenticate();
      guard();
      if (proof.accountId !== d.accountId)
        throw new Error("Reauthentication returned a different account.");
      try {
        status = await d.request(receipt, proof.accessToken);
      } catch {
        guard();
        // A failed request is ambiguous until the receipt has been checked.
        status = await d.status(receipt);
        if (status === "not_found")
          throw new Error(
            "Deletion was not confirmed. Retry with the same saved request.",
          );
      }
      guard();
    }
    if (status === "not_found")
      throw new Error("Deletion was not confirmed. Please retry.");
    // Cleanup is safe only after the server has durably accepted the request.
    await d.cleanup();
    return status;
  }
  return {
    submit(confirmed: boolean) {
      if (!flight)
        flight = run(confirmed).finally(() => {
          flight = null;
        });
      return flight;
    },
  };
}
