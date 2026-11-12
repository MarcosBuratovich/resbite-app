/** Once shown, an error stays at least this long: a read that succeeds sooner doesn't take it away (H35). */
export const ERROR_HOLD_MS = 4000;

/** The error on screen, and when it was first shown (null: it came while nothing could show it, so it waits). */
export type HeldError = { message: string; shownAt: number | null } | null;

/**
 * The error to show, from the chat's current one (`error`), whether a place to show it is on screen (`showing`), and
 * the time (H35):
 * - a new error replaces the one held, its clock starting when it is shown;
 * - one the chat has cleared stays until it has been shown for `ERROR_HOLD_MS`; one never shown waits until it is.
 */
export function holdError(held: HeldError, error: string | null, showing: boolean, now: number): HeldError {
  if (error !== null) {
    if (held === null || held.message !== error) return { message: error, shownAt: showing ? now : null };
    return held.shownAt === null && showing ? { ...held, shownAt: now } : held;
  }
  if (held === null) return null;
  if (held.shownAt === null) return showing ? { ...held, shownAt: now } : held;
  return now - held.shownAt >= ERROR_HOLD_MS ? null : held;
}

/** When a held error that has been shown may go; null while it waits to be shown. */
export const heldUntil = (held: HeldError): number | null =>
  held && held.shownAt !== null ? held.shownAt + ERROR_HOLD_MS : null;

/** Cancel or closing a sheet takes away an error that was shown, never one that wasn't yet (H35). */
export const dismissed = (held: HeldError): HeldError => (held && held.shownAt === null ? held : null);
