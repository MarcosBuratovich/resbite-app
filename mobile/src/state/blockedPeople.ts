import { dayLabel, phoneZone } from "../domain/chatRules";
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
  /** How many unblocks went through since the screen opened. */
  unblocks: number;
  /** What the last unblock that went through says, and where focus goes, until the next unblock starts. */
  after: AfterUnblock | null;
};

/**
 * After an unblock (ruling SR4): "Unblocked <name>." for the screen reader, and the row focus moves to: the one that
 * took the removed row's place, else the one above it, else (null) the empty line. `seq` counts on with each unblock,
 * so focus moves once per unblock.
 */
export type AfterUnblock = { seq: number; notice: string; focus: string | null };

export const BLOCKED_PEOPLE_START: BlockedPeopleState = {
  people: null,
  reading: false,
  readError: null,
  unblocking: null,
  unblockError: null,
  unblocks: 0,
  after: null,
};

/**
 * Whether the screen may read or unblock now: never without an account, in the preview (nothing is read or sent),
 * while signing out, or while an unblock runs.
 */
export const mayAct = (i: { userId: string | undefined; preview: boolean; signingOut: boolean; working: boolean }): boolean =>
  Boolean(i.userId) && !i.preview && !i.signingOut && !i.working;

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
      return { ...state, people: null, reading: false, readError: event.message, unblockError: null, after: null };
    case "unblockStarted":
      return { ...state, reading: false, unblocking: event.userId, unblockError: null, after: null };
    case "unblockSucceeded": {
      const at = state.people ? state.people.findIndex((p) => p.userId === event.userId) : -1;
      if (!state.people || at < 0) return { ...state, unblocking: null };
      const people = state.people.filter((p) => p.userId !== event.userId);
      const unblocks = state.unblocks + 1;
      return {
        ...state,
        people,
        unblocking: null,
        unblocks,
        after: {
          seq: unblocks,
          notice: SAFETY_COPY.unblocked(shownName(state.people[at].name)),
          focus: (people[at] ?? people[at - 1])?.userId ?? null,
        },
      };
    }
    case "unblockFailed":
      return { ...state, unblocking: null, unblockError: { userId: event.userId, message: event.message } };
  }
}

/**
 * One blocked person as the screen draws them: the name cleaned, "Someone" when none is left, and its Unblock, which
 * reads "Unblock" and is spoken "Unblock <name>" (ruling SR4: the name isn't drawn twice in a narrow row).
 */
export type BlockedRow = {
  userId: string;
  name: string;
  /** "Unblock". */
  action: string;
  /** "Unblock <name>". */
  label: string;
  /** "Blocked <short date>" (ruling SR7), or null when the block's time is missing or can't be read. */
  since: string | null;
  /** What the screen reader says for the row: the name, and when it was blocked ("Leo, Blocked Wed 10 Jun"). */
  rowLabel: string;
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
  | { kind: "none"; after: AfterUnblock | null }
  | { kind: "list"; rows: BlockedRow[]; after: AfterUnblock | null };

/**
 * What the screen shows: the list in my_blocks' order (newest first), each row with when it was blocked (SR7; `now` and
 * `zone` default to the phone's), `noneBlocked` when it is empty, the error line
 * with Try again when the read failed, or a spinner; the list and the empty line carry what the last unblock says. The
 * preview has no account, so nobody is blocked there.
 */
export function blockedPeopleView(
  state: BlockedPeopleState,
  { preview, now = Date.now(), zone = phoneZone() }: { preview: boolean; now?: number; zone?: string },
): BlockedPeopleView {
  if (preview) return { kind: "none", after: null };
  if (state.people !== null) {
    if (state.people.length === 0) return { kind: "none", after: state.after };
    return {
      kind: "list",
      after: state.after,
      rows: state.people.map((p) => {
        const name = shownName(p.name);
        // The chat's short date in the phone's zone, the year only when it isn't this one (SR7).
        const day = typeof p.at === "string" ? dayLabel(p.at, zone, now) : "";
        const since = day ? SAFETY_COPY.blockedOn(day) : null;
        return {
          userId: p.userId,
          name,
          action: SAFETY_COPY.unblockAction,
          label: SAFETY_COPY.unblock(name),
          since,
          rowLabel: since ? `${name}, ${since}` : name,
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
