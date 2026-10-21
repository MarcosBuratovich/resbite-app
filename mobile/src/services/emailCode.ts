// GI2 email by six-digit code: Supabase mails a code and the person types it back. The mappers take
// their dependencies so they run under node with recording stubs, as appleSignIn.ts does.

type AuthError = { message: string; status?: number } | null;
export type EmailCodeDeps = {
  signInWithOtp: (args: { email: string; options: { shouldCreateUser: true } }) => Promise<{ error: AuthError }>;
  verifyOtp: (args: { email: string; token: string; type: "email" }) => Promise<{ error: AuthError }>;
  now: () => number;
};

export const CODE_LIFETIME_MS = 600_000;
const resendDelayMs = 60_000;
const invalidEmailCopy = "Enter a valid email address.";
const waitCopy = "Wait a minute, then send a new code.";
const expiredCopy = "That code has expired. Send a new one.";
const mismatchCopy = "That code doesn’t match. Try again.";
const connectionCopy = "Check your connection and try again.";

const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
// auth-js returns network failures as status 0 rather than throwing.
const isConnectionFailure = (error: { status?: number }) =>
  error.status === 0 || (error.status !== undefined && error.status >= 500);

export async function sendCode(
  d: EmailCodeDeps,
  email: string,
): Promise<{ ok: true; resendAt: number } | { ok: false; message: string }> {
  const address = email.trim();
  if (!looksLikeEmail(address)) return { ok: false, message: invalidEmailCopy };
  try {
    const { error } = await d.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    if (!error) return { ok: true, resendAt: d.now() + resendDelayMs };
    if (isConnectionFailure(error)) return { ok: false, message: connectionCopy };
    if (error.status === 429 || error.message.toLowerCase().includes("rate limit"))
      return { ok: false, message: waitCopy };
    return { ok: false, message: error.message || connectionCopy };
  } catch {
    return { ok: false, message: connectionCopy };
  }
}

/**
 * GoTrue words a wrong and an expired code alike ("Token has expired or is invalid"), so expiry is told
 * by the clock: `sentAt` is when the code was sent.
 */
export async function verifyCode(
  d: EmailCodeDeps,
  email: string,
  token: string,
  sentAt: number,
): Promise<{ ok: true } | { ok: false; message: string; clear: boolean }> {
  const code = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, message: mismatchCopy, clear: true };
  try {
    const { error } = await d.verifyOtp({ email: email.trim(), token: code, type: "email" });
    if (!error) return { ok: true };
    if (isConnectionFailure(error)) return { ok: false, message: connectionCopy, clear: false };
    const expired = d.now() - sentAt >= CODE_LIFETIME_MS;
    return { ok: false, message: expired ? expiredCopy : mismatchCopy, clear: true };
  } catch {
    return { ok: false, message: connectionCopy, clear: false };
  }
}

const client = () => (require("./supabase") as typeof import("./supabase")).supabase;

export const emailCodeDeps: EmailCodeDeps = {
  signInWithOtp: (args) => client().auth.signInWithOtp(args),
  verifyOtp: (args) => client().auth.verifyOtp(args),
  now: () => Date.now(),
};
