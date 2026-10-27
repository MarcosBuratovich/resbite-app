// Bringing a web-only account (made by answering an invitation on the web) into this one. The code is
// sent to and checked by an isolated auth client, so the app's own session never changes; the foreign
// token then goes to the Edge Function with the app session's bearer token.
import { PHONE_CODE_COPY, type AuthError } from "./phoneCode";
import { PHONE_COPY } from "../domain/phoneCopy";

export type FoldClientDeps = {
  /** The isolated client's `signInWithOtp`, never the app's. */
  signInWithOtp(a: { phone: string; options: { shouldCreateUser: boolean } }): Promise<{ error: AuthError }>;
  /** The isolated client's `verifyOtp`; the foreign session's access token on success. */
  verifyOtp(a: { phone: string; token: string; type: "sms" }): Promise<{ error: AuthError; accessToken?: string | null }>;
  exchangeTestCode(phone: string, code: string): Promise<string | null>;
  /** The app session's access token, or null when signed out. */
  appAccessToken(): Promise<string | null>;
  /** POSTs to `/functions/v1/fold-phone-account`; resolves with the HTTP status. */
  callFold(a: { appToken: string; body: { foreign_token: string; phone: string } }): Promise<{ status: number }>;
  now(): number;
};
export type FoldResult =
  | { ok: true }
  /** `gone`: the web account no longer exists, so the number is free for the ordinary Add flow. */
  | { ok: false; message: string; clear: boolean; gone?: true };

const CODE_LIFETIME_MS = 600_000;
const TEST_CODE = "000000";
const isConnectionFailure = (error: { status?: number }) =>
  error.status === 0 || (error.status !== undefined && error.status >= 500);

export async function sendFoldCode(
  d: Pick<FoldClientDeps, "signInWithOtp" | "now">,
  e164: string,
): Promise<{ ok: true; resendAt: number } | { ok: false; message: string }> {
  try {
    const { error } = await d.signInWithOtp({ phone: e164, options: { shouldCreateUser: false } });
    if (!error) return { ok: true, resendAt: d.now() + 60_000 };
    if (isConnectionFailure(error)) return { ok: false, message: PHONE_CODE_COPY.connection };
    if (error.status === 429 || error.message.toLowerCase().includes("rate limit"))
      return { ok: false, message: PHONE_CODE_COPY.wait };
    // No web account to confirm (or it is gone): the number is not one to bring over.
    if (error.code === "otp_disabled") return { ok: false, message: PHONE_CODE_COPY.taken };
    return { ok: false, message: error.message || PHONE_CODE_COPY.connection };
  } catch {
    return { ok: false, message: PHONE_CODE_COPY.connection };
  }
}

export async function foldPhoneAccount(
  d: FoldClientDeps,
  e164: string,
  token: string,
  sentAt: number,
): Promise<FoldResult> {
  let code = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, message: PHONE_CODE_COPY.mismatch, clear: true };
  try {
    if (code === TEST_CODE) code = (await d.exchangeTestCode(e164, code)) ?? code;
    const verified = await d.verifyOtp({ phone: e164, token: code, type: "sms" });
    if (verified.error) {
      if (isConnectionFailure(verified.error)) return { ok: false, message: PHONE_CODE_COPY.connection, clear: false };
      const expired = d.now() - sentAt >= CODE_LIFETIME_MS;
      return { ok: false, message: expired ? PHONE_CODE_COPY.expired : PHONE_CODE_COPY.mismatch, clear: true };
    }
    const appToken = await d.appAccessToken();
    if (!verified.accessToken || !appToken)
      return { ok: false, message: PHONE_CODE_COPY.connection, clear: false };
    const { status } = await d.callFold({ appToken, body: { foreign_token: verified.accessToken, phone: e164 } });
    if (status >= 200 && status < 300) return { ok: true };
    if (status === 503) return { ok: false, message: PHONE_COPY.foldOff, clear: false };
    // The code was just verified, so a 401 means the web user was already deleted: the number is free.
    if (status === 401) return { ok: false, message: PHONE_COPY.foldGone, clear: false, gone: true };
    if (status === 403 || status === 409) return { ok: false, message: PHONE_COPY.taken, clear: false };
    return { ok: false, message: PHONE_CODE_COPY.connection, clear: false };
  } catch {
    return { ok: false, message: PHONE_CODE_COPY.connection, clear: false };
  }
}

const url = () => process.env.EXPO_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.co";
const key = () => process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "unconfigured";

export const phoneFoldDeps = (): FoldClientDeps => {
  // Loaded lazily so the mappers run under node; one isolated client per fold, never persisted.
  const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
  const Crypto = require("expo-crypto") as typeof import("expo-crypto");
  const main = () => (require("./supabase") as typeof import("./supabase")).supabase;
  const isolated = createClient(url(), key(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `resbite-fold-proof-${Crypto.randomUUID()}`,
    },
  });
  return {
    signInWithOtp: (a) => isolated.auth.signInWithOtp(a),
    verifyOtp: async (a) => {
      const { data, error } = await isolated.auth.verifyOtp(a);
      return { error, accessToken: data?.session?.access_token ?? null };
    },
    exchangeTestCode: async (p_phone, p_code) => {
      const { data, error } = await main().rpc("exchange_test_code", { p_phone, p_code });
      if (error) throw new Error(error.message);
      return (data as string | null) ?? null;
    },
    appAccessToken: async () => (await main().auth.getSession()).data.session?.access_token ?? null,
    callFold: async ({ appToken, body }) => {
      const response = await fetch(`${url()}/functions/v1/fold-phone-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key(), Authorization: `Bearer ${appToken}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      return { status: response.status };
    },
    now: () => Date.now(),
  };
};
