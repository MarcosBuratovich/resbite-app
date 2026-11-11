import { CIRCLE_COPY } from "./circleCopy";
import type { Plan } from "./plans";

export type BringInvites = 0 | 1 | 2 | 3;
export type BringLevels = 1 | 2 | 3;
/** A resbite's circle of trust: how many people each guest may bring (0 is Nobody), and how many levels deep. */
export type Circle = { invites: BringInvites; levels: BringLevels };

const INVITES: readonly number[] = [0, 1, 2, 3];
const LEVELS: readonly number[] = [1, 2, 3];

/** The first word of a display name; "" for a blank one. */
export function firstName(displayName: string | null | undefined): string {
  return (displayName ?? "").trim().split(/\s+/)[0] ?? "";
}

/** The plan's circle. A plan read without the columns (a cached or preview plan) reads as Nobody, one level. */
export function circleOf(plan: Pick<Plan, "bring_invites" | "bring_levels">): Circle {
  const invites = plan.bring_invites;
  const levels = plan.bring_levels;
  return {
    invites: typeof invites === "number" && INVITES.includes(invites) ? invites : 0,
    levels: typeof levels === "number" && LEVELS.includes(levels) ? levels : 1,
  };
}

const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);
const those = (n: number) => (n === 1 ? "that person" : "each of them");

/** What the two choices mean, said of one guest (CO-04); "" for Nobody. */
export function circleSentence({ name, invites, levels }: { name: string } & Circle): string {
  if (invites === 0) return "";
  const first = `${name} can bring ${people(invites)}`;
  if (levels === 1) return `${first}. ${CIRCLE_COPY.accountsOnly}`;
  if (levels === 2) return `${first}, and ${those(invites)} can bring ${invites} more. ${CIRCLE_COPY.accountsOnly}`;
  return `${first}, and each of them can bring ${invites} more, and so on for 3 levels. ${CIRCLE_COPY.accountsOnly}`;
}

/**
 * The name the sentence uses (CO-04): among the guests who are going and aren't hosts (the owner and admins invite;
 * they never bring), the first name that comes first alphabetically, ignoring case, with the user id breaking a tie,
 * so it stays the same whatever order the server sends the rows in. A blank name and `unnamed`, the placeholder
 * `readGuests` gives a guest without a name (`UNNAMED_GUEST`), are never used. With none, `CIRCLE_COPY.eachGuest`.
 */
export function firstGuestName(
  guests: readonly { userId: string; name: string; response: string }[],
  hosts: readonly (string | undefined)[],
  unnamed: string,
): string {
  let best: { name: string; key: string; userId: string } | null = null;
  for (const g of guests) {
    if (g.response !== "accepted" || hosts.includes(g.userId) || g.name === unnamed) continue;
    const name = firstName(g.name);
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    const order = best ? key.localeCompare(best.key) || (g.userId < best.userId ? -1 : g.userId > best.userId ? 1 : 0) : -1;
    if (order < 0) best = { name, key, userId: g.userId };
  }
  return best?.name ?? CIRCLE_COPY.eachGuest;
}

/**
 * The card's state: the circle the server has, the one shown, whether a save is in flight, and the plan version the
 * saved circle is known at (the screen's read, or the version the last confirmed save returned).
 */
export type CircleSaveState = { saved: Circle; shown: Circle; saving: boolean; version: number };
export type CircleSaveEvent =
  | { type: "tap"; value: Circle }
  | { type: "saved"; value: Circle; version: number }
  | { type: "failed" }
  /** The screen read the plan: its circle at its version. */
  | { type: "read"; value: Circle; version: number };

const same = (a: Circle, b: Circle) => a.invites === b.invites && a.levels === b.levels;

/**
 * Each change saves at once. A tap shows its value and starts a save; a tap while one is in flight, or on what is
 * shown, returns the state unchanged (the same object), so the caller sends nothing. A failure shows the saved
 * value again, never one tapped before. A plan read replaces the card only when it is at least as new as what the
 * card knows and no save is in flight (that save's answer decides): a read taken before a confirmed save, landing
 * after it, changes nothing (D8). The known version never goes back.
 */
export function circleSave(state: CircleSaveState, event: CircleSaveEvent): CircleSaveState {
  switch (event.type) {
    case "tap":
      if (state.saving || same(state.shown, event.value)) return state;
      return { ...state, shown: event.value, saving: true };
    case "saved":
      return { saved: event.value, shown: event.value, saving: false, version: Math.max(state.version, event.version) };
    case "failed":
      return { ...state, shown: state.saved, saving: false };
    case "read":
      if (state.saving || event.version < state.version) return state;
      if (event.version === state.version && same(state.saved, event.value) && same(state.shown, event.value)) return state;
      return { saved: event.value, shown: event.value, saving: false, version: event.version };
  }
}
