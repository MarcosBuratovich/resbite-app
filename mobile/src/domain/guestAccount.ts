// GI2's guest account words and rules that outlive its email-code screen (retired in plan 3): the 18+ tick,
// Apple and Google, the code countdown, names from a session, and an event link's closed states.

export const TERMS_VERSION = "2026-10";

/** "1:00", "0:59", "0:05"; never negative. */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const GUEST_COPY = {
  tick: "I’m 18 or over",
  terms: "I agree to the Terms and Privacy Policy.",
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
