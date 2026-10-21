// GI2 guest account rules: copy, step choice and formatting for the sign-in-to-join screen.

export const TERMS_VERSION = "2026-10";

/** "1:00", "0:59", "0:05"; never negative. */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const GUEST_COPY = {
  heading: "Create your account to reply",
  body: "Just your name for now. You can set up the rest later.",
  tick: "I’m 18 or over",
  terms: "I agree to the Terms and Privacy Policy.",
  ageHelper: "Resbite is for people aged 18 and over.",
  apple: "Continue with Apple",
  google: "Continue with Google",
  email: "Continue with email",
  existing: "I already have an account",
  emailHeading: "What’s your email?",
  emailField: "Email",
  sendCode: "Send code",
  codeHeading: "Check your email",
  codeBody: (email: string) => `We sent a 6-digit code to ${email}.`,
  resendIn: (seconds: number) => `Didn’t get it? Send a new code in ${formatCountdown(seconds)}`,
  resend: "Send a new code",
  openMail: "Open email app",
  nameHeading: "What’s your name?",
  nameField: "Your name",
  nameHelper: "This is how the people you invite will see you.",
  joining: "Joining…",
  goHome: "Go to Resbite",
} as const;

export type GuestStep = "providers" | "email" | "code" | "name" | "joining";

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

export function nextStepAfterSignIn(args: { name: string | null; attested: boolean }): GuestStep {
  if (!args.attested) return "providers";
  return args.name ? "joining" : "name";
}

/** "Fri 23 Oct, 7.30pm" in the event's zone (UTC when unknown); "" without a usable start. */
export function previewLine(preview: { starts_at?: string; time_zone?: string }): string {
  if (!preview.starts_at) return "";
  const date = new Date(preview.starts_at);
  if (!Number.isFinite(date.getTime())) return "";
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: preview.time_zone || "UTC" }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).formatToParts(date);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const minute = get("minute");
  const time = `${get("hour")}${minute === "00" ? "" : `.${minute}`}${get("dayPeriod").toLowerCase().replace(/[^apm]/g, "")}`;
  return `${get("weekday")} ${get("day")} ${get("month")}, ${time}`;
}

export function stateSentence(state: "cancelled" | "happened" | "inactive", host: string | undefined): string {
  if (state === "cancelled") return `${host || "The host"} cancelled this resbite.`;
  if (state === "happened") return "This resbite has already happened.";
  return "This invitation is no longer active.";
}
