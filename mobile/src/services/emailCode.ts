// GI2 email by six-digit code: Supabase mails a code and the person types it back. The mappers take
// their dependencies so they run under node with recording stubs, as appleSignIn.ts does.

type AuthError = { message: string; status?: number } | null;
export type EmailCodeDeps = {
  signInWithOtp: (args: { email: string; options: { shouldCreateUser: true } }) => Promise<{ error: AuthError }>;
  verifyOtp: (args: { email: string; token: string; type: "email" }) => Promise<{ error: AuthError }>;
  now: () => number;
};

const resendDelayMs = 60_000;
const invalidEmailCopy = "Enter a valid email address.";
const waitCopy = "Wait a minute, then send a new code.";
const expiredCopy = "That code has expired. Send a new one.";
const mismatchCopy = "That code doesn’t match. Try again.";
const sendFailedCopy = "Check your connection and try again.";

const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function sendCode(
  d: EmailCodeDeps,
  email: string,
): Promise<{ ok: true; resendAt: number } | { ok: false; message: string }> {
  const address = email.trim();
  if (!looksLikeEmail(address)) return { ok: false, message: invalidEmailCopy };
  try {
    const { error } = await d.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    if (!error) return { ok: true, resendAt: d.now() + resendDelayMs };
    if (error.status === 429 || error.message.toLowerCase().includes("rate limit"))
      return { ok: false, message: waitCopy };
    return { ok: false, message: error.message || sendFailedCopy };
  } catch {
    return { ok: false, message: sendFailedCopy };
  }
}

export async function verifyCode(
  d: EmailCodeDeps,
  email: string,
  token: string,
): Promise<{ ok: true } | { ok: false; message: string; clear: boolean }> {
  const code = token.trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, message: mismatchCopy, clear: true };
  try {
    const { error } = await d.verifyOtp({ email: email.trim(), token: code, type: "email" });
    if (!error) return { ok: true };
    const expired = error.message.toLowerCase().includes("expired");
    return { ok: false, message: expired ? expiredCopy : mismatchCopy, clear: true };
  } catch {
    return { ok: false, message: sendFailedCopy, clear: false };
  }
}

const client = () => (require("./supabase") as typeof import("./supabase")).supabase;

export const emailCodeDeps: EmailCodeDeps = {
  signInWithOtp: (args) => client().auth.signInWithOtp(args),
  verifyOtp: (args) => client().auth.verifyOtp(args),
  now: () => Date.now(),
};
