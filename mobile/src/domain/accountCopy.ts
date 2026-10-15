import type { CategoryKey } from "./categories";
import { permissionCopy, type NotificationPermission } from "./notifications";

// UX4 wording for profile, settings, sign-in and Wellness (spec docs/superpowers/specs/2026-10-15-ux4-design.md).
// Headings are at most three words. Protected wording (notices, guidance, warnings) stays where it was.

export type AuthMode = "login" | "register" | "reset" | "confirm";

/** The three sign-up steps' titles, in today's order: name, optional details, account. */
export const signupTitles = ["Your name?", "About you", "Your account"] as const;

/** The sign-in screen's heading for a mode (and the sign-up step). */
export function authTitle(mode: AuthMode, step: number, confirmedEmail: string): string {
  if (mode === "confirm") return confirmedEmail ? "Check your inbox" : "Confirm your email";
  if (mode === "register") return signupTitles[Math.min(Math.max(step, 0), signupTitles.length - 1)];
  if (mode === "reset") return "Reset password";
  return "Welcome back";
}

export type AccessState = "checking" | "unconfirmed" | "error" | "pending";

/** The account access check's state: checking first, then the account status (anything else is waiting). */
export function accessState(checking: boolean, status: string): AccessState {
  if (checking) return "checking";
  if (status === "unconfirmed") return "unconfirmed";
  if (status === "error") return "error";
  return "pending";
}

export const accessTitles: Record<AccessState, string> = {
  checking: "Checking your account",
  unconfirmed: "Confirm your email",
  error: "Let’s try again",
  pending: "Waiting for access",
};

/** Notifications' permission chip: the permission's title, or the checking and failure states. */
export function permissionChip(permission: NotificationPermission | null, busy: boolean): string {
  if (permission) return permissionCopy[permission].title;
  return busy ? "Checking permission…" : "Couldn’t check permission";
}

/** The email-link page's heading. */
export function callbackTitle(ready: boolean, failed: boolean): string {
  return ready ? "New password" : failed ? "Let’s try again" : "Confirming…";
}

/** The introduction's three slides (text only; the screen pairs them with today's pictures). */
export const introSlides = [
  { title: "Little plans", line: "A coffee, a bike ride, a little creativity." },
  { title: "Your people", line: "Turn “we should catch up” into a real invitation." },
  { title: "Make memories", line: "Set a date and a place, and keep every answer together." },
] as const;

/** Wellness sample rows (UX4-D5): approved categories, today's minutes. Sample data only. */
export const wellnessSample: readonly { category: CategoryKey; minutes: number }[] = [
  { category: "creative", minutes: 60 },
  { category: "physical", minutes: 60 },
  { category: "community", minutes: 30 },
];

/** "2h 30m", "45m" or "3h". */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}
