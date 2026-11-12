import { SAFETY_COPY, shownName } from "../domain/safetyCopy";
import type { BlockedPerson } from "../services/safety";

/** Blocked people (G-S10), as the screen holds it between reads. */
export type BlockedPeopleState = {
  /** The list as last read, less the people unblocked since; null before a read lands and after a read fails. */
  people: BlockedPerson[] | null;
  /** A read is running. */
  reading: boolean;
  /** Why the last read failed, until a read succeeds; a retry keeps it. */
  readError: string | null;
  /** Whose unblock is running: one at a time. */
  unblocking: string | null;
  /** Why the last unblock failed, and whose it was. */
  unblockError: { userId: string; message: string } | null;
};

export const BLOCKED_PEOPLE_START: BlockedPeopleState = {
  people: null,
  reading: false,
  readError: null,
  unblocking: null,
  unblockError: null,
};

export type BlockedPeopleEvent =
  /** Another account (or the preview): nothing of the last one's list stays. */
  | { type: "reset" }
  | { type: "readStarted" }
  | { type: "readSucceeded"; people: BlockedPerson[] }
  | { type: "readFailed"; message: string }
  | { type: "unblockStarted"; userId: string }
  | { type: "unblockSucceeded"; userId: string }
  | { type: "unblockFailed"; userId: string; message: string };

/**
 * The next state. A failed read drops the list, so the error line names nobody and never reads as "nobody blocked"
 * (N13's rule for an unknown list). An unblock that went through takes its row away without a second read; one that
 * failed keeps the row, with why beside it. An unblock that starts ends a running refresh, whose answer (read before
 * the unblock) the hook no longer takes.
 */
export function blockedPeopleStep(state: BlockedPeopleState, event: BlockedPeopleEvent): BlockedPeopleState {
  switch (event.type) {
    case "reset":
      return BLOCKED_PEOPLE_START;
    case "readStarted":
      return { ...state, reading: true };
    case "readSucceeded": {
      const error = state.unblockError;
      const stillListed = error !== null && event.people.some((p) => p.userId === error.userId);
      return { ...state, people: event.people, reading: false, readError: null, unblockError: stillListed ? error : null };
    }
    case "readFailed":
      return { ...state, people: null, reading: false, readError: event.message, unblockError: null };
    case "unblockStarted":
      return { ...state, reading: false, unblocking: event.userId, unblockError: null };
    case "unblockSucceeded":
      return {
        ...state,
        people: state.people && state.people.filter((p) => p.userId !== event.userId),
        unblocking: null,
      };
    case "unblockFailed":
      return { ...state, unblocking: null, unblockError: { userId: event.userId, message: event.message } };
  }
}

/** One blocked person as the screen draws them: the name cleaned, "Someone" when none is left, and its Unblock. */
export type BlockedRow = {
  userId: string;
  name: string;
  /** "Unblock <name>". */
  action: string;
  /** This row's unblock is running. */
  busy: boolean;
  /** An unblock is running, this one or another's. */
  disabled: boolean;
  /** Why this row's last unblock failed. */
  error: string | null;
};

export type BlockedPeopleView =
  | { kind: "loading" }
  | { kind: "failed"; message: string; retrying: boolean }
  | { kind: "none" }
  | { kind: "list"; rows: BlockedRow[] };

/**
 * What the screen shows: the list in my_blocks' order (newest first), `noneBlocked` when it is empty, the error line
 * with Try again when the read failed, or a spinner. The preview has no account, so nobody is blocked there.
 */
export function blockedPeopleView(state: BlockedPeopleState, { preview }: { preview: boolean }): BlockedPeopleView {
  if (preview) return { kind: "none" };
  if (state.people !== null) {
    if (state.people.length === 0) return { kind: "none" };
    return {
      kind: "list",
      rows: state.people.map((p) => {
        const name = shownName(p.name);
        return {
          userId: p.userId,
          name,
          action: SAFETY_COPY.unblock(name),
          busy: state.unblocking === p.userId,
          disabled: state.unblocking !== null,
          error: state.unblockError?.userId === p.userId ? state.unblockError.message : null,
        };
      }),
    };
  }
  if (state.readError !== null) return { kind: "failed", message: state.readError, retrying: state.reading };
  return { kind: "loading" };
}
