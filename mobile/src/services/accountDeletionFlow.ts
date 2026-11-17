import { DELETION_COPY, type DeletionProof } from "../domain/deletion";
import type { AuthError, PhoneCodeDeps } from "./phoneCode";

/** Durable receipt only: never store passwords or authentication proofs. */
export type DeletionReceipt = {
  accountId: string;
  requestId: string;
  recoveryToken: string;
};
export type DeletionStatus = "not_found" | "queued" | "processing" | "complete";
/** How the person proves it is them: a password or a code (`credential`), or Apple. */
export type DeletionMode = "credential" | "apple";
/**
 * The fresh session the proof made. Apple's authorisation code rides along to the request so the Edge function can
 * revoke Apple's tokens (ASR2-8); like the token, it is never saved.
 */
export type DeletionProofSession = { accountId: string; accessToken: string; appleAuthorizationCode?: string };
export type DeletionDependencies = {
  enabled: boolean;
  preview: boolean;
  accountId: string;
  /** ASR2-2's proof for the account (`deletionProof`); it chooses the mode. `null` can't delete in the app. */
  proof: DeletionProof | null;
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
  reauthenticate: () => Promise<DeletionProofSession>;
  request: (receipt: DeletionReceipt, proof: string, appleAuthorizationCode?: string) => Promise<DeletionStatus>;
  cleanup: () => Promise<void>;
};

/** The part of a Supabase client the phone proof uses; the deletion screen's isolated client fits it. */
export type PhoneProofClient = {
  auth: {
    signInWithOtp(a: { phone: string; options: { shouldCreateUser: boolean } }): Promise<{ error: AuthError }>;
    verifyOtp(a: { phone: string; token: string; type: "sms" | "phone_change" }): Promise<{
      data: { session: { access_token: string } | null; user: { id: string } | null };
      error: AuthError;
    }>;
  };
};

/**
 * The phone code's dependencies on an isolated client, for a deletion proof: a verified code signs in on that client
 * only, and `onSession` receives the session it made. Adding a number is not a proof, so `updatePhone` rejects.
 */
export function phoneProofDeps(
  client: PhoneProofClient,
  onSession: (session: { accountId: string; accessToken: string }) => void,
): PhoneCodeDeps {
  return {
    signInWithOtp: (a) => client.auth.signInWithOtp(a),
    updatePhone: () => Promise.reject(new Error("A deletion proof never changes the number.")),
    verifyOtp: async (a) => {
      const { data, error } = await client.auth.verifyOtp(a);
      if (!error && data.session && data.user)
        onSession({ accountId: data.user.id, accessToken: data.session.access_token });
      return { error };
    },
    now: Date.now,
  };
}

export function createAccountDeletionFlow(d: DeletionDependencies) {
  const mode: DeletionMode = d.proof === "apple" ? "apple" : "credential";
  let flight: Promise<DeletionStatus | null> | null = null;
  const guard = () => {
    if (!d.enabled || d.preview) throw new Error(DELETION_COPY.unavailable);
    d.assertCurrent();
  };
  /** Resolves `null` when Apple's sheet was closed: nothing was requested and the receipt stays. */
  async function run(confirmed: boolean): Promise<DeletionStatus | null> {
    // An account with no proof the app can take (ASR2-2) deletes by writing to the privacy address.
    if (d.proof === null) throw new Error(DELETION_COPY.noProof);
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
        if (!d.reauthenticateWithApple) throw new Error(DELETION_COPY.noProof);
        const apple = await d.reauthenticateWithApple();
        guard();
        if (!apple.ok) return null;
      }
      const proof = await d.reauthenticate();
      guard();
      if (proof.accountId !== d.accountId)
        throw new Error("Reauthentication returned a different account.");
      try {
        status = await d.request(receipt, proof.accessToken, proof.appleAuthorizationCode);
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
