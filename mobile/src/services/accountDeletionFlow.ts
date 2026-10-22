/** Durable receipt only: never store passwords or authentication proofs. */
export type DeletionReceipt = {
  accountId: string;
  requestId: string;
  recoveryToken: string;
};
export type DeletionStatus = "not_found" | "queued" | "processing" | "complete";
/**
 * GI2-D10: an account that signs in with Apple only has no password, and Apple's relay address may
 * not deliver a code, so it confirms by signing in with Apple again. The Edge worker applies the same rule.
 */
export const appleOnlyAccount = (providers: readonly string[] = []) =>
  providers.includes("apple") && !providers.includes("email");
/** How the person proves it is them: a password or an emailed code (`credential`), or Apple. */
export type DeletionMode = "credential" | "apple";
export type DeletionDependencies = {
  enabled: boolean;
  preview: boolean;
  accountId: string;
  /** The account's sign-in providers (`app_metadata.providers`); they choose the mode. */
  providers?: readonly string[];
  assertCurrent: () => void;
  load: () => Promise<DeletionReceipt | null>;
  save: (receipt: DeletionReceipt) => Promise<void>;
  createReceipt: () => DeletionReceipt;
  status: (receipt: DeletionReceipt) => Promise<DeletionStatus>;
  /**
   * Apple mode: shows Apple's sheet. `{ ok: false }` means the sheet was closed; a failure throws
   * with the message to show. `reauthenticate` then returns the session Apple's sign-in made.
   */
  reauthenticateWithApple?: () => Promise<{ ok: boolean }>;
  reauthenticate: () => Promise<{ accountId: string; accessToken: string }>;
  request: (receipt: DeletionReceipt, proof: string) => Promise<DeletionStatus>;
  cleanup: () => Promise<void>;
};
export function createAccountDeletionFlow(d: DeletionDependencies) {
  const mode: DeletionMode = appleOnlyAccount(d.providers) ? "apple" : "credential";
  let flight: Promise<DeletionStatus | null> | null = null;
  const guard = () => {
    if (!d.enabled || d.preview)
      throw new Error("Account deletion is unavailable in this build.");
    d.assertCurrent();
  };
  /** Resolves `null` when Apple's sheet was closed: nothing was requested and the receipt stays. */
  async function run(confirmed: boolean): Promise<DeletionStatus | null> {
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
      if (mode === "apple") {
        if (!d.reauthenticateWithApple)
          throw new Error("Sign in with Apple is unavailable in this build.");
        const apple = await d.reauthenticateWithApple();
        guard();
        if (!apple.ok) return null;
      }
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
    mode,
    submit(confirmed: boolean) {
      if (!flight)
        flight = run(confirmed).finally(() => {
          flight = null;
        });
      return flight;
    },
  };
}
