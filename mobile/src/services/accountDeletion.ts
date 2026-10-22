import { createClient } from "@supabase/supabase-js";
import * as Crypto from "expo-crypto";
import { configured, storage, supabase } from "./supabase";
import {
  appleOnlyAccount,
  createAccountDeletionFlow,
  type DeletionReceipt,
  type DeletionStatus,
} from "./accountDeletionFlow";
import { appleSignInDeps, signInWithApple } from "./appleSignIn";
export const accountDeletionEnabled =
  configured && process.env.EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED === "true";
const url =
  process.env.EXPO_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co";
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "unconfigured";
const recentKey = "resbite.deletion-recovery";
export async function loadRecentDeletionReceipt() {
  const accountId = await storage.getItem(recentKey);
  return accountId ? loadDeletionReceipt(accountId) : null;
}
const receiptKey = (accountId: string) => `resbite.deletion.${accountId}`;
const isolatedAuth = () =>
  createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `resbite-deletion-proof-${Crypto.randomUUID()}`,
    },
  });
const requireEnabled = () => {
  if (!accountDeletionEnabled)
    throw new Error("Account deletion is unavailable in this build.");
};
export async function sendDeletionCode(
  email: string,
  assertCurrent: () => void,
) {
  requireEnabled();
  assertCurrent();
  const client = isolatedAuth();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  assertCurrent();
  if (error)
    throw new Error(
      "The verification code could not be sent. Please try again.",
    );
}
export async function loadDeletionReceipt(
  accountId: string,
): Promise<DeletionReceipt | null> {
  const raw = await storage.getItem(receiptKey(accountId));
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (
    value.accountId !== accountId ||
    !/^[\da-f-]{36}$/i.test(value.requestId) ||
    !/^[\da-f]{64}$/i.test(value.recoveryToken)
  )
    throw new Error("The saved deletion request could not be read.");
  return value;
}
async function call(
  body: Record<string, string>,
  accessToken?: string,
): Promise<DeletionStatus> {
  requireEnabled();
  const response = await fetch(`${url}/functions/v1/delete-account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 404 && body.action === "status") return "not_found";
  if (!response.ok)
    throw new Error(
      "Deletion could not be confirmed. Your saved request can be checked again.",
    );
  const data = await response.json();
  if (
    data.requestId !== body.requestId ||
    !["queued", "processing", "complete"].includes(data.status)
  )
    throw new Error("Unexpected deletion response. Please check again.");
  return data.status;
}
export const checkDeletionStatus = (receipt: DeletionReceipt) =>
  call({
    action: "status",
    requestId: receipt.requestId,
    recoveryToken: receipt.recoveryToken,
  });
export function deletionFlow(options: {
  accountId: string;
  email: string;
  /** The account's `app_metadata.providers`: an Apple-only account confirms with Apple. */
  providers: readonly string[];
  preview: boolean;
  assertCurrent: () => void;
  /** The password or emailed code; `null` for an Apple-only account. */
  credential: { kind: "password" | "otp"; value: string } | null;
  cleanup: () => Promise<void>;
}) {
  // GI2-D10: Apple's sign-in goes to its own isolated client, as the password and the code do, so
  // the app's session never changes; a different Apple ID is refused by the flow's account check.
  let appleProof: { accountId: string; accessToken: string } | null = null;
  return createAccountDeletionFlow({
    ...options,
    enabled: accountDeletionEnabled,
    load: () => loadDeletionReceipt(options.accountId),
    save: async (receipt) => {
      await storage.setItem(
        receiptKey(options.accountId),
        JSON.stringify(receipt),
      );
      await storage.setItem(recentKey, options.accountId);
    },
    createReceipt: () => ({
      accountId: options.accountId,
      requestId: Crypto.randomUUID(),
      recoveryToken: Array.from(Crypto.getRandomBytes(32), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    }),
    status: checkDeletionStatus,
    reauthenticateWithApple: async () => {
      appleProof = null;
      const client = isolatedAuth();
      const result = await signInWithApple({
        ...appleSignInDeps,
        signInWithIdToken: async (args) => {
          const { data, error } = await client.auth.signInWithIdToken(args);
          if (!error && data.session && data.user)
            appleProof = {
              accountId: data.user.id,
              accessToken: data.session.access_token,
            };
          return { error };
        },
      });
      if (result.ok) return { ok: true };
      if (result.cancelled) return { ok: false };
      throw new Error(result.message);
    },
    reauthenticate: async () => {
      if (appleOnlyAccount(options.providers)) {
        const proof = appleProof;
        appleProof = null;
        if (!proof) throw new Error("Check your connection and try again.");
        return proof;
      }
      if (!options.credential)
        throw new Error(
          "Verification failed. Check your password or request a new email code.",
        );
      const client = isolatedAuth();
      const result =
        options.credential.kind === "password"
          ? await client.auth.signInWithPassword({
              email: options.email,
              password: options.credential.value,
            })
          : await client.auth.verifyOtp({
              email: options.email,
              token: options.credential.value,
              type: "email",
            });
      if (result.error || !result.data.session || !result.data.user)
        throw new Error(
          "Verification failed. Check your password or request a new email code.",
        );
      return {
        accountId: result.data.user.id,
        accessToken: result.data.session.access_token,
      };
    },
    request: async (receipt, proof) => {
      options.assertCurrent();
      const { data } = await supabase.auth.getSession();
      options.assertCurrent();
      if (data.session?.user.id !== options.accountId)
        throw new Error("Account changed. Start again.");
      return call(
        {
          action: "request",
          requestId: receipt.requestId,
          recoveryToken: receipt.recoveryToken,
          proof,
        },
        data.session.access_token,
      );
    },
  });
}
