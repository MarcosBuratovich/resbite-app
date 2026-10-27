// Phone sign-up, sign-in and add-a-number by six-digit SMS code. Dependencies are injected so the mappers
// run under node with recording stubs.

import { PHONE_COPY } from "../domain/phoneCopy";

export type AuthError = { message: string; status?: number; code?: string } | null;
export type PhoneCodeDeps = {
  signInWithOtp(a: { phone: string; options: { shouldCreateUser: boolean } }): Promise<{ error: AuthError }>;
  updatePhone(phone: string): Promise<{ error: AuthError }>;
  verifyOtp(a: { phone: string; token: string; type: "sms" | "phone_change" }): Promise<{ error: AuthError }>;
  exchangeTestCode(phone: string, code: string): Promise<string | null>;
  now(): number;
};
export type PhonePurpose = "signup" | "signin" | "add";

const CODE_LIFETIME_MS = 600_000;
const resendDelayMs = 60_000;
const TEST_CODE = "000000";

export const PHONE_CODE_COPY = {
  noAccount: "No Resbite account uses this number yet.",
  /** One sentence with PHONE_COPY.taken, so the two can't drift. */
  taken: PHONE_COPY.taken,
  mismatch: "That code doesn’t match. Try again.",
  expired: "That code has expired. Send a new one.",
  wait: "Wait a minute, then send a new code.",
  connection: "Check your connection and try again.",
};

const isConnectionFailure = (error: { status?: number }) =>
  error.status === 0 || (error.status !== undefined && error.status >= 500);

export async function sendPhoneCode(
  d: PhoneCodeDeps,
  e164: string,
  purpose: PhonePurpose,
): Promise<{ ok: true; resendAt: number } | { ok: false; message: string; reason?: "no_account" | "taken" }> {
  try {
    const { error } =
      purpose === "add"
        ? await d.updatePhone(e164)
        : await d.signInWithOtp({ phone: e164, options: { shouldCreateUser: purpose === "signup" } });
    if (!error) return { ok: true, resendAt: d.now() + resendDelayMs };
    if (isConnectionFailure(error)) return { ok: false, message: PHONE_CODE_COPY.connection };
    if (purpose === "signin" && error.code === "otp_disabled")
      return { ok: false, reason: "no_account", message: PHONE_CODE_COPY.noAccount };
    if (purpose === "add" && error.code === "phone_exists")
      return { ok: false, reason: "taken", message: PHONE_CODE_COPY.taken };
    if (error.status === 429 || error.message.toLowerCase().includes("rate limit"))
      return { ok: false, message: PHONE_CODE_COPY.wait };
    return { ok: false, message: error.message || PHONE_CODE_COPY.connection };
  } catch {
    return { ok: false, message: PHONE_CODE_COPY.connection };
  }
}

/** Expiry is told by the clock, since GoTrue words wrong and expired alike. */
export async function verifyPhoneCode(
  d: PhoneCodeDeps,
  e164: string,
  token: string,
  sentAt: number,
  purpose: PhonePurpose,
): Promise<{ ok: true } | { ok: false; message: string; clear: boolean }> {
  let code = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, message: PHONE_CODE_COPY.mismatch, clear: true };
  try {
    if (code === TEST_CODE) code = (await d.exchangeTestCode(e164, code)) ?? code;
    const { error } = await d.verifyOtp({ phone: e164, token: code, type: purpose === "add" ? "phone_change" : "sms" });
    if (!error) return { ok: true };
    if (isConnectionFailure(error)) return { ok: false, message: PHONE_CODE_COPY.connection, clear: false };
    const expired = d.now() - sentAt >= CODE_LIFETIME_MS;
    return { ok: false, message: expired ? PHONE_CODE_COPY.expired : PHONE_CODE_COPY.mismatch, clear: true };
  } catch {
    return { ok: false, message: PHONE_CODE_COPY.connection, clear: false };
  }
}

const client = () => (require("./supabase") as typeof import("./supabase")).supabase;

export const phoneCodeDeps: PhoneCodeDeps = {
  signInWithOtp: (a) => client().auth.signInWithOtp(a),
  updatePhone: (phone) => client().auth.updateUser({ phone }),
  verifyOtp: (a) => client().auth.verifyOtp(a),
  exchangeTestCode: async (p_phone, p_code) => {
    const { data, error } = await client().rpc("exchange_test_code", { p_phone, p_code });
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
  },
  now: () => Date.now(),
};
