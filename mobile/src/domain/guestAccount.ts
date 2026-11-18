// GI2's guest account words and rules that outlive its email-code screen (retired in plan 3): the 18+ tick,
// Apple and Google, the code countdown, names from a session, and an event link's closed states.

/**
 * The Terms of Use version a sign-up or invitation tick records when the server reports none (plan 4): version 1.0
 * of the Terms. The link site's fallback and supabase/ops/publish-terms-version.sql use the same value.
 */
export const TERMS_VERSION = "2026-12";

/** "1:00", "0:59", "0:05"; never negative. */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const GUEST_COPY = {
  /** One tick for both facts (community-rules-short.md section 2): the age and the Terms of Use. */
  tick: "I’m 18 or over and I accept the Terms of Use.",
  /** The line under the tick, outside the checkbox, so VoiceOver can reach its two links (TermsLine). */
  terms: "Read the Terms of Use. Our Privacy Policy explains how we use your data.",
  /** The tick's VoiceOver hint. */
  tickHint: "Confirms you’re 18 or over and accept the Terms of Use.",
  ageHelper: "Resbite is for people aged 18 and over.",
  apple: "Continue with Apple",
  google: "Continue with Google",
  resendIn: (seconds: number) => `Didn’t get it? Send a new code in ${formatCountdown(seconds)}`,
  goHome: "Go to Resbite",
} as const;

const MAX_NAME = 80;

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_NAME ? trimmed : null;
}

/** Apple's name first, then metadata display_name, full_name, name; each trimmed to 1-80 characters. */
export function nameFromSession(user: { user_metadata?: Record<string, unknown> } | null, appleName: string | null): string | null {
  const meta = user?.user_metadata;
  return (
    cleanName(appleName) ??
    cleanName(meta?.display_name) ??
    cleanName(meta?.full_name) ??
    cleanName(meta?.name)
  );
}

/**
 * Apple's name to save as `display_name` (spec §2), so it outlives the app: Apple sends it on the first
 * authorisation only. Saved only when the account has no display name yet, and only as `nameFromSession` would
 * read it (trimmed, 1-80 characters); otherwise `null`.
 */
export function appleNameToSave(appleName: string | null, meta: Record<string, unknown> | undefined): string | null {
  const current = meta?.display_name;
  if (typeof current === "string" && current.trim()) return null;
  return cleanName(appleName);
}

export function stateSentence(state: "cancelled" | "happened" | "inactive", host: string | undefined): string {
  if (state === "cancelled") return `${host || "The host"} cancelled this resbite.`;
  if (state === "happened") return "This resbite has already happened.";
  return "This invitation is no longer active.";
}
